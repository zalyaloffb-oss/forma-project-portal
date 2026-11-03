package ru.forma.catalog;

/** Version codes decide ordering; display names never decide whether to upgrade. */
public final class UpdatePolicy {
    public static final long CHECK_INTERVAL=6*60*60*1000L, REMIND_INTERVAL=24*60*60*1000L;
    private UpdatePolicy() {}
    public static boolean elapsed(long now,long previous,long interval) {
        return previous<=0 || now<previous || now-previous>=interval;
    }
    public static boolean newer(long installed,long offered,int sdk,int minimumSdk) {
        return installed>0 && offered>installed && minimumSdk>0 && sdk>=minimumSdk;
    }
    public static boolean remind(long offered,long deferred,long now,long deferredAt) {
        return offered!=deferred || elapsed(now,deferredAt,REMIND_INTERVAL);
    }
    public static String downloadUrl(String version) {
        return version!=null && version.matches("[0-9]{1,5}(\\.[0-9]{1,5}){1,3}")
            ? Urls.ROOT+"/android/Forma-"+version+".apk" : "";
    }
}
