"""Read creation of the original saved Fusion version, never the export clock."""
from datetime import datetime, timezone
import re


def creation_metadata(data_file, lookup=None):
    first=data_file if data_file.versionNumber==1 else None
    if first is None and lookup:
        version_id=data_file.versionId
        original_id,count=re.subn(r'([?&]version=)\d+',r'\g<1>1',version_id)
        if count:
            try:candidate=lookup(original_id)
            except RuntimeError as error:
                print('Fusion direct version lookup failed; checking saved version history:',error)
                candidate=None
            if candidate and candidate.id==data_file.id and candidate.versionNumber==1:
                first=candidate
    if first is None:
        versions=data_file.versions
        for index in dict.fromkeys([versions.count-1,0]):
            if index>=0:
                candidate=versions.item(index)
                if candidate and candidate.versionNumber==1:
                    first=candidate;break
        if first is None:
            first=next((f for f in versions if f.versionNumber==1),None)
    if first is None or first.id!=data_file.id:
        raise ValueError('Fusion did not return the original saved version: '+data_file.name)
    epoch=first.dateCreated
    if not isinstance(epoch,int) or isinstance(epoch,bool) or epoch<=0:
        raise ValueError('Fusion did not return a valid creation date: '+data_file.name)
    return {'sourceCreatedAt':datetime.fromtimestamp(epoch,timezone.utc).isoformat(),
            'sourceCreatedVersion':1,'dateSource':'Fusion DataFile version 1'}
