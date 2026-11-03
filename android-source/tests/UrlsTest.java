import ru.forma.catalog.Urls;
public class UrlsTest {
 private static int n;private static void check(boolean v){n++;if(!v)throw new AssertionError("Case "+n);}
 public static void main(String[] args){
  check(Urls.sameHost(Urls.CATALOG));
  check(Urls.sameHost(Urls.ROOT+"/data/catalog.json"));
  check(!Urls.sameHost("http://zalyaloffb-oss.github.io/forma-project-portal/"));
  check(!Urls.sameHost("https://zalyaloffb-oss.github.io/other/"));
  check(!Urls.sameHost("https://zalyaloffb-oss.github.io.evil.org/forma-project-portal/"));
  check(!Urls.sameHost("https://evil@zalyaloffb-oss.github.io/forma-project-portal/"));
  check(!Urls.sameHost("https://zalyaloffb-oss.github.io:1234/forma-project-portal/"));
  check(!Urls.sameHost("https://zalyaloffb-oss.github.io/forma-project-portal/assets/%2e%2e/evil"));
  check(Urls.asset("assets/x/model.glb").equals(Urls.CATALOG+"assets/x/model.glb"));
  check(Urls.asset("/api/secret").isEmpty());
  check(Urls.asset("//evil.org/file.pdf").isEmpty());
  check(Urls.asset("https://evil.org/file.pdf").isEmpty());
  check(Urls.viewer("fusion-123","/pervyy-trest").equals(Urls.ROOT+"/pervyy-trest/"));
  check(Urls.viewer("fusion-123","//evil.org").equals(Urls.viewer("fusion-123")));
  check(Urls.viewer("x&other=secret").isEmpty());
  check(Urls.viewer("../account").isEmpty());
  check(!Urls.web("javascript:alert(1)"));
  check(!Urls.web("intent://project#Intent;end"));
  System.out.println(n+" HTTPS/project-scope/deep-link checks passed");
 }
}
