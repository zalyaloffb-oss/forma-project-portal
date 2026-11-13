"""Static ESM payload audit. Bytes are source payloads, not timings or compressed transfers."""
from pathlib import Path
import argparse,json,re

ROOT=Path(__file__).resolve().parent.parent
IMPORT=re.compile(r'''^\s*import\s+(?!\()(?:[^'";]*?\bfrom\s*)?['"]([^'"]+)['"]''',re.M)
EXPORT=re.compile(r'''^\s*export\s+(?:\*|\{[^}]*\})\s+from\s*['"]([^'"]+)['"]''',re.M)

def dependencies(entry):
    found={};pending=[ROOT/entry]
    while pending:
        path=pending.pop().resolve()
        if path in found:continue
        if not path.is_relative_to(ROOT) or not path.is_file():raise ValueError('Missing module: '+str(path))
        text=path.read_text(encoding='utf-8');found[path]=path.stat().st_size
        for url in IMPORT.findall(text)+EXPORT.findall(text):
            url=url.split('?')[0]
            if url=='three':target=ROOT/'vendor/three/build/three.module.js'
            elif url.startswith('three/addons/'):target=ROOT/'vendor/three/examples/jsm'/url[len('three/addons/'):]
            elif url.startswith('.'):target=path.parent/url
            else:raise ValueError('Unmapped module: '+url)
            pending.append(target)
    return {p.relative_to(ROOT).as_posix():size for p,size in sorted(found.items())}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output');parser.add_argument('--label',default='current');args=parser.parse_args()
    rows={}
    for entry in ['app.js','viewer-pro.js','banner-viewer.js']:
        files=dependencies(entry);rows[entry]={'bytes':sum(files.values()),'modules':len(files),'files':files}
        print(entry,sum(files.values()),'bytes',len(files),'static modules')
    report={'label':args.label,'method':'Static import graph; uncompressed source bytes; excludes dynamic imports, models and images. Not a browser timing measurement.','entries':rows}
    if args.output:
        out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':main()
