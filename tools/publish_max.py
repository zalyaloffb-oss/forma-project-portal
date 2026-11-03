"""Publish the already-extracted Max model through the shared GitHub adapter."""
import argparse,hashlib,json
from pathlib import Path
from GitHubPublisher import publish

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--folder',required=True);p.add_argument('--title',required=True);p.add_argument('--source',required=True);p.add_argument('--id');p.add_argument('--assembly',action='store_true');args=p.parse_args()
    folder=Path(args.folder).resolve();source=Path(args.source).resolve()
    pid=args.id or 'max-'+hashlib.sha256(str(source).lower().encode()).hexdigest()
    files={'model':str(folder/'model.glb'),'source':str(source)}
    if (folder/'cover.png').is_file():files['cover']=str(folder/'cover.png')
    if args.assembly and (folder/'assembly.pdf').is_file():files['assembly']=str(folder/'assembly.pdf')
    result=publish({'projectId':pid,'projectKey':str(source).lower(),'title':args.title},files)
    (folder/'published.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))
