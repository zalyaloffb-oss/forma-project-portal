package ru.forma.catalog;

import java.net.URI;

/** No credentials or arbitrary WebView origins are accepted. */
public final class Urls {
    public static final String HOST = "zalyaloffb-oss.github.io";
    public static final String ORIGIN = "https://" + HOST;
    public static final String ROOT = ORIGIN + "/forma-project-portal";
    public static final String CATALOG = ROOT + "/";
    public static boolean sameHost(String value) {
        try {
            URI u = new URI(value);
            return "https".equals(u.getScheme())
                && u.getPath()!=null && u.getPath().startsWith("/forma-project-portal/") && !u.getPath().contains("/../") && !u.getPath().contains("/./")
                && HOST.equalsIgnoreCase(u.getHost()) && u.getRawUserInfo() == null
                && (u.getPort() == -1 || u.getPort() == ("https".equals(u.getScheme()) ? 443 : 80));
        } catch (Exception e) { return false; }
    }
    public static boolean web(String value) {
        try { URI u = new URI(value); return "https".equals(u.getScheme()) && u.getHost() != null && u.getRawUserInfo() == null; }
        catch (Exception e) { return false; }
    }
    public static String asset(String path) {
        if (path == null || path.isEmpty()) return "";
        String value = path.startsWith("assets/") ? CATALOG + path : path.startsWith("/") && !path.startsWith("//") ? ORIGIN + path : path;
        return sameHost(value) ? value : "";
    }
    public static String viewer(String project) {
        if (project == null || !project.matches("[A-Za-z0-9_-]{1,150}")) return "";
        return CATALOG + "viewer.html?project=" + project;
    }
    public static String viewer(String project, String path) {
        return path != null && path.matches("/[a-z0-9][a-z0-9-]{0,79}") ? ROOT + path + "/" : viewer(project);
    }
    private Urls() {}
}
