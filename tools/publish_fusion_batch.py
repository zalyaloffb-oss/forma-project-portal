"""Upload completed Fusion exports, preserving dates, project identities and documents."""
import argparse
import json
from pathlib import Path
import sys
import time
import traceback

import publish_export
from yandex_disk import Disk


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def save(path,value):
    temporary=path.with_suffix('.json.next')
    temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');temporary.replace(path)


def apply_dates(records):
    catalog=publish_export.read_catalog();changed=[]
    sources={row['id']:row for row in records}
    for parent in catalog['projects']:
        for project in [parent,*parent.get('furniture',[])]:
            record=sources.get(project.get('fusionDataFileId'))
            if not record:continue
            date=publish_export.creation_date({'dataFileId':record['id'],**record})
            if project.get('date')!=date or project.get('sourceCreatedAt')!=record['sourceCreatedAt']:
                changed.append({'projectId':project['id'],'oldDate':project.get('date'),'date':date})
                project['date']=date
                for key in ('sourceCreatedAt','sourceCreatedVersion','dateSource'):project[key]=record[key]
    if changed:publish_export.save_catalog(catalog)
    return changed


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--job',type=Path,required=True)
    parser.add_argument('--retry',action='store_true')
    args=parser.parse_args()
    target=args.job.with_name('publication.json')
    report=read(target) if target.is_file() else {'published':[],'failed':[],'dateCorrections':[]}
    if args.retry:report['failed']=[]
    disk=Disk()
    while True:
        job=read(args.job)
        if args.job.with_name('pause-publication.request').exists():
            report['phase']='paused';save(target,report);time.sleep(3);continue
        if args.job.with_name('stop.request').exists():
            report['phase']='stopped';save(target,report);return
        known={row['id'] for key in ('published','failed') for row in report[key]}
        pending=[row for row in job['exported'] if row['id'] not in known]
        for row in pending:
            if args.job.with_name('stop.request').exists():break
            packet=read(Path(row['manifest']))
            try:
                result=publish_export.publish(packet['meta'],packet['files'],push=False,disk=disk)
                report['published'].append({'id':row['id'],'name':row['name'],**result,'date':publish_export.creation_date(packet['meta'])})
                print(json.dumps({'published':len(report['published']),'name':row['name'],'date':report['published'][-1]['date']},ensure_ascii=False),flush=True)
            except Exception as error:
                report['failed'].append({'id':row['id'],'name':row['name'],'error':str(error),'traceback':traceback.format_exc()})
                print(json.dumps({'failed':row['name'],'error':str(error)},ensure_ascii=False),flush=True)
            save(target,report)
        report['dateCorrections'].extend(apply_dates(job['dateRecords']))
        report['phase']=job['phase'];save(target,report)
        if job['phase'] in ('complete','stopped'):
            # Reload once so the last exported manifest is included.
            known={row['id'] for key in ('published','failed') for row in report[key]}
            if all(row['id'] in known for row in read(args.job)['exported']):break
        time.sleep(3)
    print(json.dumps({'phase':report['phase'],'published':len(report['published']),'uploadFailures':len(report['failed']),
                      'exportFailures':len(job['failures']),'dateFailures':len(job.get('dateFailures',[])),'emptyModels':len(job['skipped'])}),flush=True)
    if report['failed'] or job['failures'] or job.get('dateFailures'):raise SystemExit(1)


if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8');sys.stderr.reconfigure(encoding='utf-8')
    main()
