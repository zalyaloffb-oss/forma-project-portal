import ru.forma.catalog.UpdatePolicy;
import ru.forma.catalog.Urls;

public class UpdatePolicyTest {
    private static int count;
    private static void check(boolean value){count++;if(!value)throw new AssertionError("Case "+count);}
    public static void main(String[] args){
        check(UpdatePolicy.newer(2,3,36,30));
        check(!UpdatePolicy.newer(3,3,36,30));
        check(!UpdatePolicy.newer(4,3,36,30));
        check(!UpdatePolicy.newer(2,3,30,36));
        check(!UpdatePolicy.newer(0,3,36,30));
        check(!UpdatePolicy.newer(2,3,36,0));
        check(UpdatePolicy.elapsed(100,0,1000));
        check(!UpdatePolicy.elapsed(1100,1000,1000));
        check(UpdatePolicy.elapsed(2000,1000,1000));
        check(UpdatePolicy.elapsed(900,1000,1000));
        check(!UpdatePolicy.remind(3,3,2000,1000));
        check(UpdatePolicy.remind(4,3,2000,1000));
        check(UpdatePolicy.remind(3,3,1000+UpdatePolicy.REMIND_INTERVAL,1000));
        check(UpdatePolicy.downloadUrl("1.0.2").equals(Urls.ROOT+"/android/Forma-1.0.2.apk"));
        check(UpdatePolicy.downloadUrl("../evil").isEmpty());
        check(UpdatePolicy.downloadUrl("1.2&next=evil").isEmpty());
        check(UpdatePolicy.downloadUrl(null).isEmpty());
        System.out.println(count+" update policy checks passed");
    }
}
