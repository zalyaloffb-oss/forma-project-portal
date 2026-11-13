"""Prepare lossless transfer copies; source models and their identities stay intact."""
import gzip,json,hashlib
from pathlib import Path
from publish_export import ROOT,read_catalog,save_catalog

def main():
    catalog=read_catalog();rows=[]
    for parent in catalog['projects']:
        for item in [parent,*parent.get('furniture',[])]:
            source=ROOT/item['modelUrl'];original=source.read_bytes()
            packed=gzip.compress(original,compresslevel=6,mtime=0)
            assert gzip.decompress(packed)==original
            target=source.with_suffix(source.suffix+'.gz');target.write_bytes(packed)
            item['modelGzipUrl']=target.relative_to(ROOT).as_posix()
            rows.append({'project':item['title'],'model':item['modelUrl'],'sourceBytes':len(original),'transferBytes':len(packed),'sha256':hashlib.sha256(original).hexdigest()})
    save_catalog(catalog)
    print(json.dumps(rows,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
