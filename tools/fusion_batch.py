"""Resumable read-only Fusion export, one folder/model per idle event.

Run start(output_dir) through the Fusion API; inspect job.json from the owner CLI.
No CAD document is saved, renamed, regrouped, or overwritten by this job.
"""
from pathlib import Path
import datetime
import hashlib
import importlib.util
import json
import os
import struct
import sys
import threading
import time
import traceback

import adsk.core
import adsk.fusion
from FusionMetadata import creation_metadata

EVENT='EESCatalogueBatchExport'
controller=None


def lookup_source(runner,row):
    try:
        file=runner.app.data.findFileById(row['id'])
    except RuntimeError as error:
        print('Direct Fusion lookup failed; checking the original folder:',row['name'],error)
        file=None
    if file is None:
        folder=runner.app.data.findFolderById(row['folderId'])
        if folder:file=folder.dataFiles.itemById(row['id'])
    if file is None or file.id!=row['id']:
        raise RuntimeError('Fusion model is unavailable in its original folder: '+row['name'])
    return file

def audit_existing_dates(runner,catalog_file):
    if runner.state.get('existingDatesAudited'):return
    catalog=json.loads(Path(catalog_file).read_text(encoding='utf-8'))
    known={r['id'] for r in runner.state['dateRecords']}
    runner.state.setdefault('dateFailures',[])
    for parent in catalog['projects']:
        for entry in [parent,*parent.get('furniture',[])]:
            source=entry.get('fusionDataFileId')
            if not source or source in known:continue
            runner.write('reading-original-date',current=entry['title'])
            try:
                file=runner.app.data.findFileById(source)
                if not file:raise RuntimeError('Fusion source is unavailable: '+entry['title'])
                dates=creation_metadata(file,runner.app.data.findFileById)
                runner.state['dateRecords'].append({'id':source,**dates});known.add(source)
            except Exception as error:
                traceback.print_exc()
                runner.state['dateFailures'].append({'id':source,'name':entry['title'],'error':str(error)})
    runner.state['existingDatesAudited']=True
    runner.write('existing-dates-audited')


class Batch(adsk.core.CustomEventHandler):
    def __init__(self,output,source_folder,exporter,initial_inventory=None,only_files=None):
        super().__init__()
        self.app=adsk.core.Application.get()
        self.output=Path(output);self.output.mkdir(parents=True,exist_ok=True)
        self.exporter=exporter
        self.initial_document=self.app.activeDocument
        self.original_docs={d.creationId for d in self.app.documents}
        self.event=self.app.registerCustomEvent(EVENT);self.event.add(self)
        self.timer=None;self.cancelled=False;self.turn='scan'
        file=self.output/'job.json'
        if file.is_file():
            self.state=json.loads(file.read_text(encoding='utf-8'))
            self.state['phase']='running'
        else:
            self.state={'phase':'running','sourceFolderId':source_folder,'folders':[],
                        'files':[],'scannedFolders':[],'exported':[],'skipped':[],
                        'failures':[],'dateRecords':[],'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
            if initial_inventory:
                root=json.loads(Path(initial_inventory).read_text(encoding='utf-8'))
                self.state['scannedFolders'].append(root['rootFolderId'])
                self.state['files']=[{**f,'folderId':source_folder,'folderPath':root['rootFolderName']} for f in root['files']]
                self.state['folders']=[{**f,'path':root['rootFolderName']+'/'+f['name']} for f in root['folders']]
            else:self.state['folders']=[{'id':source_folder,'path':'Короба EES'}]
            if only_files:
                self.state['folders']=[]
                self.state['files']=[f for f in self.state['files'] if f['id'] in only_files]
        self.write('ready')

    def write(self,step,**values):
        self.state.update(step=step,updatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),**values)
        file=self.output/'job.json';temporary=file.with_suffix('.json.next')
        temporary.write_text(json.dumps(self.state,ensure_ascii=False,indent=2),encoding='utf-8');temporary.replace(file)

    def schedule(self):
        if not self.cancelled:
            self.timer=threading.Timer(.4,lambda:self.app.fireCustomEvent(EVENT,''))
            self.timer.daemon=True;self.timer.start()

    def scan(self):
        entry=self.state['folders'][0]
        self.write('listing-folder',current=entry['path'])
        folder=self.app.data.findFolderById(entry['id'])
        if not folder:raise RuntimeError('Fusion folder is unavailable: '+entry['path'])
        files=[{'id':f.id,'name':f.name,'extension':f.fileExtension,'version':f.versionNumber,
                'folderId':folder.id,'folderPath':entry['path']} for f in folder.dataFiles]
        children=[{'id':f.id,'name':f.name,'path':entry['path']+'/'+f.name} for f in folder.dataFolders]
        existing={f['id'] for f in self.state['files']}
        self.state['files'].extend(f for f in files if f['id'] not in existing)
        self.state['scannedFolders'].append(entry['id']);self.state['folders'].pop(0)
        queued={f['id'] for f in self.state['folders']}|set(self.state['scannedFolders'])
        self.state['folders'].extend(f for f in children if f['id'] not in queued)
        self.write('folder-listed',current=entry['path'])

    def candidates(self):
        if self.state.get('inventoryFirst') and self.state['folders']:return []
        if not self.state['folders']:audit_existing_dates(self,Path(__file__).resolve().parents[1]/'data/catalog.json')
        done={r['id'] for key in ('exported','skipped','failures') for r in self.state[key] if r.get('kind')!='folder'}
        candidates=[f for f in self.state['files'] if f['extension'].lower() in ('f3d','f3z') and f['id'] not in done]
        # Verify the established exporter first on a small named furniture model.
        candidates.sort(key=lambda f:(not f['name'].startswith('Витрина 500'),f['name']=='Untitled',f['name']))
        return candidates

    def export(self,row):
        self.write('opening-model',current=row['folderPath']+'/'+row['name'])
        data_file=lookup_source(self,row)
        latest=data_file.latestVersion
        dates=creation_metadata(latest,self.app.data.findFileById)
        self.state['dateRecords']=[r for r in self.state['dateRecords'] if r['id']!=row['id']]+[{'id':row['id'],**dates}]
        directory=self.output/'exports'/hashlib.sha256(row['id'].encode()).hexdigest()[:20]
        directory.mkdir(parents=True,exist_ok=True)
        doc=next((d for d in self.app.documents if d.dataFile and d.dataFile.id==row['id']),None)
        opened=doc is None
        if doc and doc.isModified:raise RuntimeError('Open model has unsaved changes; not exporting or closing it: '+row['name'])
        if opened:doc=self.app.documents.open(latest,True)
        if not doc:raise RuntimeError('Fusion did not open model: '+row['name'])
        doc.activate();design=adsk.fusion.Design.cast(doc.products.itemByProductType('DesignProductType'))
        if not design:raise RuntimeError('File is not a Fusion design: '+row['name'])
        try:
            def report(stage,message,pump=True):
                if self.cancelled or (self.output/'stop.request').exists():raise InterruptedError('Batch stopped')
                self.write('exporting-model',current=row['name'],exportStage=stage,exportMessage=message)
                if pump:adsk.doEvents()
            if not design.rootComponent.bRepBodies.count and not design.rootComponent.meshBodies.count and not design.rootComponent.occurrences.count:
                self.state['skipped'].append({'id':row['id'],'name':row['name'],'reason':'Empty design, no bodies or components'})
                self.write('empty-model-skipped',current=row['name']);return
            meta,files,count=self.exporter.prepare(design,str(directory),report,date_metadata=dates)
            data=Path(files['model']).read_bytes()
            gltf=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
            meshes=len(gltf.get('meshes',[]))
            if not meshes:
                self.state['skipped'].append({'id':row['id'],'name':row['name'],'reason':'No displayable geometry'})
                self.write('empty-model-skipped',current=row['name']);return
            meta.update(dates,title=latest.name,version=str(latest.versionNumber),sourceFolderPath=row['folderPath'],bodyCount=count,meshCount=meshes)
            receipt={'meta':meta,'files':files,'bodyCount':count,'meshCount':meshes}
            manifest=directory/'export.json'
            manifest.write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
            self.state['exported'].append({'id':row['id'],'name':row['name'],'version':latest.versionNumber,'manifest':str(manifest),'bodyCount':count,'meshCount':meshes})
            self.write('model-exported',current=row['name'])
        finally:
            if opened and doc.isValid:doc.close(False)
            if self.initial_document and self.initial_document.isValid:self.initial_document.activate()

    def notify(self,args):
        if self.cancelled or (self.output/'stop.request').exists():
            self.cancelled=True;self.write('stopped',phase='stopped');return
        candidates=self.candidates()
        scan=bool(self.state['folders']) and (self.turn=='scan' or not candidates)
        if not scan and not candidates:
            self.write('complete',phase='complete');return
        entry=self.state['folders'][0] if scan else candidates[0]
        try:
            if scan:self.scan();self.turn='export'
            else:self.export(entry);self.turn='scan'
        except Exception as error:
            traceback.print_exc()
            self.state['failures'].append({'id':entry['id'],'name':entry.get('path',entry.get('name')),
                'kind':'folder' if scan else 'model','error':str(error),'traceback':traceback.format_exc()})
            if scan:self.state['folders'].pop(0)
            self.write('item-failed',current=entry.get('name',''))
        self.schedule()


def start(output,source_folder,initial_inventory=None,only_files=None):
    global controller
    if controller and not controller.cancelled and controller.state['phase']=='running':
        raise RuntimeError('A batch export is already running')
    base=Path.home()/'AppData/Roaming/Autodesk/Autodesk Fusion 360/API/AddIns/FusionProjectExporter'
    if str(base) not in sys.path:sys.path.insert(0,str(base))
    spec=importlib.util.spec_from_file_location('ees_bulk_exporter',base/'FusionProjectExporter.py')
    exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
    controller=Batch(output,source_folder,exporter,initial_inventory,only_files)
    controller.schedule()
    return {'started':True,'output':str(controller.output),'queuedFolders':len(controller.state['folders']),'knownFiles':len(controller.state['files'])}


def stop():
    if controller:
        controller.cancelled=True
        if controller.timer:controller.timer.cancel()
        controller.write('stopped',phase='stopped')
