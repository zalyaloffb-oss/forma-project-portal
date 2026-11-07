"""Import an explicitly supplied browser draft package into the owner's working tree."""
from pathlib import Path
import argparse,base64,json,urllib.parse
from publish_export import ROOT,read_catalog,save_catalog,write_asset,slugify

def decode_file(value):
    if not isinstance(value,dict) or value.get('$file') is not True:raise ValueError('Not a draft file')
    data=base64.b64decode(value['data'],validate=True)
    if len(data)>50*1024*1024:raise ValueError('Draft file exceeds 50 MB')
    return data

def main():
    parser=argparse.ArgumentParser();parser.add_argument('package');args=parser.parse_args()
    packet=json.loads(Path(args.package).read_text(encoding='utf-8'))
    if packet.get('format')!='forma-catalog-drafts-v1':raise ValueError('Unsupported draft package')
    catalog=read_catalog()
    import tempfile,hashlib,re
    with tempfile.TemporaryDirectory(prefix='forma-drafts-') as temporary:
        folder=Path(temporary)
        def file_path(project,value,kind):
            data=decode_file(value);suffix='.pdf' if data.startswith(b'%PDF-') else '.jpg' if data.startswith(b'\xff\xd8\xff') else '.png' if data.startswith(b'\x89PNG') else None
            if suffix is None:raise ValueError('Only PDF, JPG and PNG draft files are accepted')
            f=folder/(hashlib.sha256(data).hexdigest()+suffix);f.write_bytes(data)
            return write_asset(project,kind,f)
        for draft in packet['projects']:
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,150}',draft['id']):raise ValueError('Invalid project ID')
            project=next((p for p in catalog['projects'] if p['id']==draft['id']),None)
            if project is None:
                slug=slugify(draft['title'])
                if any(p['viewerPath']=='/'+slug for p in catalog['projects']):slug+='-'+hashlib.sha256(draft['id'].encode()).hexdigest()[:6]
                project={'id':draft['id'],'viewerPath':'/'+slug,'published':True,'attachments':[]};catalog['projects'].insert(0,project)
            for key in ['title','customer','event','manager','date','status','source']:
                if isinstance(draft.get(key),str):project[key]=draft[key]
            for key in ['design','assembly','expo','electrical','cover']:
                value=draft.get(key)
                if isinstance(value,dict) and value.get('$file'):project[key+'Url']=file_path(project,value,key)
            attachments=[]
            for i,a in enumerate(draft.get('attachments',[])):
                if isinstance(a.get('blob'),dict):attachments.append({'id':a['id'],'name':a['name'],'kind':a['kind'],'url':file_path(project,a['blob'],'attachment-'+str(i))})
                else:
                    previous=next((x for x in project.get('attachments',[]) if x['id']==a.get('id')),None)
                    if previous:attachments.append(previous)
            project['attachments']=attachments
        catalog['managers']=[{'name':n} for n in packet.get('managers',[]) if isinstance(n,str) and n.strip()]
        save_catalog(catalog)
    print('Imported',len(packet['projects']),'drafts. Review, commit and push to publish.')

if __name__=='__main__':main()
