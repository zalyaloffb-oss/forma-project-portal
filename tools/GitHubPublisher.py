"""Owner-machine adapter for Fusion/Max. Credentials stay in Git Credential Manager."""
import importlib.util,json,sys
from pathlib import Path

def publish(meta,files,report=lambda *args:None):
    config=Path.home()/'.codex/secrets/forma-github/connection.json'
    if not config.is_file():raise RuntimeError('Публикация GitHub не настроена на этом компьютере. Экспорт на диск доступен без неё.')
    settings=json.loads(config.read_text(encoding='utf-8'))
    repository=Path(settings['repositoryPath']).resolve();tools=repository/'tools'
    if not (repository/'.git').is_dir():raise RuntimeError('Не найдена рабочая копия каталога GitHub.')
    if str(tools) not in sys.path:sys.path.insert(0,str(tools))
    spec=importlib.util.spec_from_file_location('forma_github_publish',tools/'publish_export.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module.publish(meta,files,report)
