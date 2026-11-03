"""Build a signed Android APK using official SDK tools, without Gradle dependencies.

Toolchain: JDK 21; Android platform 36, build-tools 36.0.0.
Signing material stays under the user's private .codex/secrets directory.
"""
import hashlib,json,os,secrets,shutil,subprocess,sys,zipfile,uuid
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT=Path(__file__).resolve().parent
CACHE=Path.home()/'.cache/forma-android-tools'
SDK=Path(os.environ.get('ANDROID_HOME',str(CACHE/'sdk')))
JAVA=Path(os.environ['JAVA_HOME']) if os.environ.get('JAVA_HOME') else next((CACHE/'java').glob('jdk-*'))
TOOLS=SDK/'build-tools/36.0.0'
PLATFORM=SDK/'platforms/android-36/android.jar'
BUILD=CACHE/('build-'+uuid.uuid4().hex[:12])
OUT=ROOT/'output'
PRIVATE=Path.home()/'.codex/secrets/forma-android'

def run(*args):
    result=subprocess.run([str(x) for x in args],stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    if result.returncode:
        print(result.stdout.decode('utf-8',errors='replace'))
        raise RuntimeError('Build tool failed: '+Path(args[0]).name)
    return result.stdout.decode('utf-8',errors='replace')

def main():
    for p in [BUILD/'classes',BUILD/'dex',BUILD/'generated',OUT,PRIVATE]:p.mkdir(parents=True,exist_ok=True)
    # aapt2 on Windows cannot reliably open a Cyrillic workspace path.
    shutil.copytree(ROOT/'app',BUILD/'app')
    assert PLATFORM.is_file(),f'Install Android platform 36 at {PLATFORM}'
    run(TOOLS/'aapt2.exe','compile','--dir',BUILD/'app/res','-o',BUILD/'resources.zip')
    run(TOOLS/'aapt2.exe','link','-o',BUILD/'base.apk','--manifest',BUILD/'app/AndroidManifest.xml','-I',PLATFORM,'--java',BUILD/'generated',BUILD/'resources.zip')
    sources=list((BUILD/'app/src').rglob('*.java'))+list((BUILD/'generated').rglob('*.java'))
    response=BUILD/'javac.args'
    response.write_text('\n'.join('"'+str(p).replace('\\','/')+'"' for p in sources),encoding='utf-8')
    run(JAVA/'bin/javac.exe','-encoding','UTF-8','--release','17','-classpath',PLATFORM,'-d',BUILD/'classes','@'+str(response))
    classes=BUILD/'classes.jar'
    with zipfile.ZipFile(classes,'w') as z:
        for p in (BUILD/'classes').rglob('*.class'):z.write(p,p.relative_to(BUILD/'classes').as_posix())
    run(JAVA/'bin/java.exe','-cp',TOOLS/'lib/d8.jar','com.android.tools.r8.D8','--release','--min-api','30','--lib',PLATFORM,'--output',BUILD/'dex',classes)
    shutil.copyfile(BUILD/'base.apk',BUILD/'unsigned.apk')
    with zipfile.ZipFile(BUILD/'unsigned.apk','a',compression=zipfile.ZIP_DEFLATED) as z:
        for p in (BUILD/'dex').glob('*.dex'):z.write(p,p.name)
    run(TOOLS/'zipalign.exe','-f','-P','16','4',BUILD/'unsigned.apk',BUILD/'aligned.apk')
    key=PRIVATE/'release.jks';password_file=PRIVATE/'signing-password.txt'
    if key.exists()!=password_file.exists():raise RuntimeError('Incomplete signing files; do not replace the existing release key.')
    if not key.exists():
        password_file.write_text(secrets.token_urlsafe(32),encoding='ascii')
        run(JAVA/'bin/keytool.exe','-genkeypair','-keystore',key,'-storepass:file',password_file,'-keypass:file',password_file,'-alias','forma','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Forma Android, O=Forma')
    manifest=ET.parse(ROOT/'app/AndroidManifest.xml').getroot()
    android='{http://schemas.android.com/apk/res/android}'
    version=manifest.attrib[android+'versionName']
    apk=OUT/f'Forma-{version}.apk'
    run(JAVA/'bin/java.exe','-jar',TOOLS/'lib/apksigner.jar','sign','--ks',key,'--ks-pass','file:'+str(password_file),'--ks-key-alias','forma','--out',apk,BUILD/'aligned.apk')
    signature=run(JAVA/'bin/java.exe','-jar',TOOLS/'lib/apksigner.jar','verify','--verbose','--print-certs',apk)
    metadata=run(TOOLS/'aapt2.exe','dump','badging',apk)
    (OUT/'signature.txt').write_text(signature,encoding='utf-8')
    (OUT/'apk-info.txt').write_text(metadata,encoding='utf-8')
    (OUT/'SHA256.txt').write_text(hashlib.sha256(apk.read_bytes()).hexdigest()+'  '+apk.name+'\n',encoding='ascii')
    release={
        'packageName':manifest.attrib['package'],
        'versionCode':int(manifest.attrib[android+'versionCode']),
        'versionName':version,
        'minSdk':int(manifest.find('uses-sdk').attrib[android+'minSdkVersion']),
        'apkUrl':f'https://zalyaloffb-oss.github.io/forma-project-portal/android/Forma-{version}.apk',
        'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),
        'notes':(ROOT/'release-notes.txt').read_text(encoding='utf-8').strip()
    }
    (OUT/'release.json').write_text(json.dumps(release,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    shutil.copyfile(apk,ROOT/'download'/apk.name)
    shutil.copyfile(OUT/'SHA256.txt',ROOT/'download/SHA256.txt')
    shutil.copyfile(OUT/'release.json',ROOT/'download/release.json')
    print(apk)
    print(signature)
    print(metadata.splitlines()[0])

if __name__=='__main__':main()

