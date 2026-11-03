package ru.forma.catalog;

import android.app.*;
import android.content.*;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.*;
import android.text.*;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
    private static final int BG=0xfff6f7f2, INK=0xff24372c, GREEN=0xff41634d, MUTED=0xff778373;
    private final ExecutorService worker=Executors.newFixedThreadPool(3);
    private final Handler main=new Handler(Looper.getMainLooper());
    private final android.util.LruCache<String,Bitmap> images=new android.util.LruCache<String,Bitmap>(12*1024*1024) {
        protected int sizeOf(String key,Bitmap value) { return value.getByteCount(); }
    };
    private FrameLayout root,content,webHost;
    private LinearLayout screen,top,cards,catalog;
    private TextView heading,summary,message;
    private EditText search;
    private ProgressBar progress;
    private WebView webView;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;
    private JSONArray projects=new JSONArray();
    private String currentUrl=Urls.CATALOG;
    private boolean showingWeb=false,loading=false;
    private Button backButton;
    private boolean checkingUpdate=false,resumed=false;
    private AlertDialog updateDialog;
    private final Runnable updateTask=()->checkUpdates(false);
    private final Runnable searchTask=()->renderCards();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setDecorFitsSystemWindows(false);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        root=new FrameLayout(this);root.setBackgroundColor(BG);
        screen=column();root.addView(screen,new FrameLayout.LayoutParams(-1,-1));
        screen.setOnApplyWindowInsetsListener((view,insets)->{
            android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());
            view.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;
        });
        top=new LinearLayout(this);top.setGravity(Gravity.CENTER_VERTICAL);top.setPadding(dp(6),0,dp(8),0);
        screen.addView(top,new LinearLayout.LayoutParams(-1,dp(56)));
        backButton=icon("‹","Назад",v->goBack());top.addView(backButton,new LinearLayout.LayoutParams(dp(44),dp(44)));
        heading=text("Форма",21,INK);heading.setTypeface(null,Typeface.BOLD);heading.setSingleLine(true);heading.setEllipsize(TextUtils.TruncateAt.END);top.addView(heading,new LinearLayout.LayoutParams(0,-2,1));
        Button share=icon("↗","Поделиться ссылкой",v->share());top.addView(share,new LinearLayout.LayoutParams(dp(44),dp(44)));
        Button menu=icon("⋮","Меню приложения",this::menu);top.addView(menu,new LinearLayout.LayoutParams(dp(44),dp(44)));
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setProgressTintList(android.content.res.ColorStateList.valueOf(GREEN));
        screen.addView(progress,new LinearLayout.LayoutParams(-1,dp(3)));progress.setVisibility(View.GONE);
        content=new FrameLayout(this);screen.addView(content,new LinearLayout.LayoutParams(-1,0,1));
        setContentView(root);screen.requestApplyInsets();buildCatalog();backButton.setVisibility(View.INVISIBLE);catalog.setFocusableInTouchMode(true);catalog.requestFocus();
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,()->goBack());
        try { projects=new JSONObject(getPreferences(0).getString("catalog","{\"projects\":[]}")).getJSONArray("projects"); } catch(Exception ignored) {}
        renderCards();loadProjects();
        String incoming=projectIntent(getIntent());
        if(!incoming.isEmpty())openWeb(incoming,"3D-проект");
        else if(state!=null && state.getBoolean("web"))openWeb(state.getString("url",Urls.CATALOG),state.getString("title","3D-проект"));
    }
    private String projectIntent(Intent intent) {
        Uri u=intent.getData();
        return u!=null && "forma".equals(u.getScheme()) && "project".equals(u.getHost()) ? Urls.viewer(u.getLastPathSegment()) : "";
    }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent);setIntent(intent);String url=projectIntent(intent);if(!url.isEmpty())openWeb(url,"3D-проект"); }
    @Override protected void onSaveInstanceState(Bundle out) { out.putBoolean("web",showingWeb);out.putString("url",currentUrl);out.putString("title",heading.getText().toString());super.onSaveInstanceState(out); }
    private LinearLayout column() { LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);return l; }
    private int dp(float value) { return Math.round(value*getResources().getDisplayMetrics().density); }
    private TextView text(String value,int size,int color) { TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);return t; }
    private GradientDrawable box(int color,int radius) { GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d; }
    private Button icon(String value,String label,View.OnClickListener listener) {
        Button b=new Button(this);b.setText(value);b.setTextSize(25);b.setTextColor(GREEN);b.setBackground(box(BG,14));b.setPadding(0,0,0,0);b.setContentDescription(label);b.setTooltipText(label);b.setOnClickListener(listener);return b;
    }
    private Button button(String label,boolean primary,View.OnClickListener listener) {
        Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextSize(15);b.setTextColor(primary?Color.WHITE:GREEN);b.setBackground(box(primary?GREEN:0xffe6ebdf,12));
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(50));p.topMargin=dp(10);b.setLayoutParams(p);b.setOnClickListener(listener);return b;
    }
    private void buildCatalog() {
        catalog=column();catalog.setPadding(dp(18),dp(12),dp(18),0);content.addView(catalog,new FrameLayout.LayoutParams(-1,-1));
        TextView eyebrow=text("БИБЛИОТЕКА ПРОЕКТОВ",11,MUTED);eyebrow.setLetterSpacing(.16f);catalog.addView(eyebrow);
        TextView title=text("Все проекты",29,INK);title.setTypeface(null,Typeface.BOLD);title.setPadding(0,dp(6),0,dp(8));catalog.addView(title);
        summary=text("Загружаем каталог…",13,MUTED);summary.setPadding(0,0,0,dp(16));catalog.addView(summary);
        search=new EditText(this);search.setSingleLine(true);search.setTextSize(15);search.setHint("Поиск: проект, заказчик, менеджер");search.setTextColor(INK);search.setHintTextColor(MUTED);search.setBackground(box(Color.WHITE,13));search.setPadding(dp(15),0,dp(12),0);
        catalog.addView(search,new LinearLayout.LayoutParams(-1,dp(52)));
        search.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int a,int c,int d){} public void onTextChanged(CharSequence s,int a,int b,int c){main.removeCallbacks(searchTask);main.postDelayed(searchTask,180);}public void afterTextChanged(Editable e){}});
        message=text("",13,MUTED);message.setPadding(0,dp(10),0,dp(6));catalog.addView(message);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);catalog.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        cards=column();cards.setPadding(0,dp(8),0,dp(20));scroll.addView(cards);
    }
    private void loadProjects() {
        if(loading)return;loading=true;progress.setIndeterminate(true);progress.setVisibility(View.VISIBLE);
        worker.execute(()->{
            try {
                String raw=readUrl(Urls.ROOT+"/data/catalog.json",4*1024*1024);JSONArray next=new JSONObject(raw).getJSONArray("projects");
                main.post(()->{if(isDestroyed())return;projects=next;getPreferences(0).edit().putString("catalog",raw).apply();loading=false;progress.setVisibility(View.GONE);message.setText("");renderCards();});
            } catch(Exception e) { main.post(()->{if(isDestroyed())return;loading=false;progress.setVisibility(View.GONE);message.setText(projects.length()>0?"Нет связи. Показан сохранённый список; 3D и файлам нужен интернет.":"Не удалось загрузить каталог. Меню → Обновить.");}); }
        });
    }
    private void renderCards() {
        cards.removeAllViews();String query=search.getText().toString().trim().toLowerCase(new Locale("ru"));int count=0,models=0;
        for(int i=0;i<projects.length();i++) {
            JSONObject p=projects.optJSONObject(i);if(p==null)continue;if(!p.optString("modelUrl").isEmpty())models++;
            String hay=(p.optString("title")+" "+p.optString("customer")+" "+p.optString("event")+" "+p.optString("manager")).toLowerCase(new Locale("ru"));
            if(!hay.contains(query))continue;count++;addCard(p);
        }
        summary.setText(projects.length()+" проектов   ·   "+models+" с 3D-моделью");
        if(count==0) {TextView empty=text(projects.length()==0?"Здесь появятся ваши проекты":"Ничего не найдено. Попробуйте другой запрос.",16,MUTED);empty.setPadding(dp(8),dp(30),dp(8),dp(30));cards.addView(empty);}
    }
    private void addCard(JSONObject p) {
        LinearLayout card=column();card.setBackground(box(Color.WHITE,16));card.setClipToOutline(true);card.setElevation(dp(1));
        LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(-1,-2);cp.bottomMargin=dp(16);cards.addView(card,cp);
        FrameLayout cover=new FrameLayout(this);cover.setBackgroundColor(0xffe9eee3);card.addView(cover,new LinearLayout.LayoutParams(-1,dp(180)));
        TextView placeholder=text("Ф О Р М А",23,MUTED);placeholder.setGravity(Gravity.CENTER);cover.addView(placeholder,new FrameLayout.LayoutParams(-1,-1));
        String coverUrl=Urls.asset(p.optString("coverUrl"));if(!coverUrl.isEmpty()) {ImageView image=new ImageView(this);image.setScaleType(ImageView.ScaleType.CENTER_CROP);image.setContentDescription("Обложка: "+p.optString("title"));cover.addView(image,new FrameLayout.LayoutParams(-1,-1));loadImage(coverUrl,image);}
        if(!p.optString("modelUrl").isEmpty()) {TextView badge=text("  3D  ",12,GREEN);badge.setBackground(box(0xf5ffffff,8));badge.setPadding(dp(5),dp(5),dp(5),dp(5));FrameLayout.LayoutParams bp=new FrameLayout.LayoutParams(-2,-2,Gravity.TOP|Gravity.RIGHT);bp.setMargins(dp(12),dp(12),dp(12),0);cover.addView(badge,bp);}
        LinearLayout info=column();info.setPadding(dp(16),dp(14),dp(16),dp(16));card.addView(info);
        TextView customer=text(p.optString("customer","Не указан"),12,MUTED);info.addView(customer);
        TextView title=text(p.optString("title","Без названия"),19,INK);title.setTypeface(null,Typeface.BOLD);title.setPadding(0,dp(5),0,dp(8));info.addView(title);
        String status=p.optString("status");if(!status.isEmpty()&&!status.equals("Не указан"))info.addView(text(status,12,GREEN));
        TextView meta=text(p.optString("manager")+(p.optString("manager").isEmpty()?"":"  ·  ")+date(p.optString("date")),12,MUTED);meta.setPadding(0,dp(7),0,0);info.addView(meta);
        card.setClickable(true);card.setFocusable(true);card.setContentDescription("Открыть проект "+p.optString("title"));card.setOnClickListener(v->detail(p));
    }
    private void loadImage(String url,ImageView target) {
        target.setTag(url);Bitmap cached=images.get(url);if(cached!=null){target.setImageBitmap(cached);return;}
        worker.execute(()->{try{
            byte[] data=bytesUrl(url,12*1024*1024);BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(data,0,data.length,options);
            int sample=1;while(options.outWidth/sample>900 || options.outHeight/sample>900)sample*=2;options.inSampleSize=sample;options.inJustDecodeBounds=false;
            Bitmap bitmap=BitmapFactory.decodeByteArray(data,0,data.length,options);if(bitmap==null)return;images.put(url,bitmap);
            main.post(()->{if(!isDestroyed() && url.equals(target.getTag()))target.setImageBitmap(bitmap);});
        }catch(Exception ignored){}});
    }
    private String date(String value) {return value.matches("\\d{4}-\\d{2}-\\d{2}")?value.substring(8)+"."+value.substring(5,7)+"."+value.substring(0,4):value;}
    private void detail(JSONObject p) {
        LinearLayout body=column();body.setPadding(dp(22),dp(12),dp(22),dp(20));
        String[] keys={"customer","event","manager","date","status"},labels={"Заказчик","Мероприятие","Менеджер","Дата создания","Статус"};
        for(int i=0;i<keys.length;i++){TextView label=text(labels[i],12,MUTED);label.setPadding(0,dp(10),0,dp(3));body.addView(label);String value=p.optString(keys[i],"—");body.addView(text(value.isEmpty()?"—":(keys[i].equals("date")?date(value):value),16,INK));}
        AlertDialog[] dialog=new AlertDialog[1];String viewer=Urls.viewer(p.optString("id"),p.optString("viewerPath"));
        if(!p.optString("modelUrl").isEmpty()&&!viewer.isEmpty())body.addView(button("Открыть 3D-модель",true,v->{dialog[0].dismiss();openWeb(viewer,p.optString("title"));}));
        addDocument(body,p.optString("designUrl"),"Дизайн-проект · скачать PDF",p.optString("title")+" — дизайн.pdf");
        addDocument(body,p.optString("assemblyUrl"),"Монтажная схема · скачать PDF",p.optString("title")+" — монтаж.pdf");
        JSONArray attachments=p.optJSONArray("attachments");if(attachments!=null)for(int i=0;i<attachments.length();i++){JSONObject a=attachments.optJSONObject(i);if(a!=null)addDocument(body,a.optString("url"),"Скачать: "+a.optString("name","Файл"),a.optString("name","Файл"));}
        String source=p.optString("source");if(Urls.web(source))body.addView(button("Исходники на Яндекс Диске",false,v->external(source)));
        body.addView(button("Поделиться проектом",false,v->shareUrl(viewer.isEmpty()||p.optString("modelUrl").isEmpty()?Urls.CATALOG:viewer)));
        ScrollView scroll=new ScrollView(this);scroll.addView(body);dialog[0]=new AlertDialog.Builder(this).setTitle(p.optString("title")).setView(scroll).setNegativeButton("Закрыть",null).create();dialog[0].show();
    }
    private void addDocument(LinearLayout body,String value,String label,String filename) {
        String url=Urls.asset(value);if(!url.isEmpty())body.addView(button(label,false,v->download(url,filename,null)));
    }
    private void download(String url,String filename,String mime) {
        if(!Urls.sameHost(url)){toast("Этот файл откроется в браузере");external(url);return;}
        try {
            String safe=filename.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]","_");if(safe.length()>180)safe=safe.substring(0,180);if(safe.isEmpty())safe="Форма — файл";
            DownloadManager.Request request=new DownloadManager.Request(Uri.parse(url));request.setTitle(safe);request.setDescription("Форма — документы проекта");
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,safe);request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            if(mime!=null&&!mime.isEmpty())request.setMimeType(mime);
            ((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(request);toast("Файл загружается. Откройте его из уведомления или папки «Загрузки».");
        } catch(Exception e) {toast("Не удалось начать загрузку. Открываю браузер.");external(url);}
    }
    private void ensureWeb() {
        if(webView!=null)return;
        if(webHost==null){webHost=new FrameLayout(this);content.addView(webHost,new FrameLayout.LayoutParams(-1,-1));}else webHost.removeAllViews();
        webView=new WebView(this);webHost.addView(webView,new FrameLayout.LayoutParams(-1,-1));
        WebSettings s=webView.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setMediaPlaybackRequiresUserGesture(true);s.setSupportMultipleWindows(true);s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setUserAgentString(s.getUserAgentString()+" FormaAndroid/1.0");s.setSafeBrowsingEnabled(true);s.setBuiltInZoomControls(false);
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(webView,false);
        webView.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
                String u=request.getUrl().toString();if(!request.isForMainFrame())return false;
                if(Urls.sameHost(u)){if(request.getUrl().getPath()!=null&&request.getUrl().getPath().startsWith("/api/models/files/")){download(u,URLUtil.guessFileName(u,null,null),null);return true;}return false;}
                if(request.hasGesture()&&Urls.web(u))external(u);return true;
            }
            @Override public void onPageStarted(WebView view,String url,Bitmap favicon){if(Urls.sameHost(url))currentUrl=url;if(showingWeb){progress.setVisibility(View.VISIBLE);progress.setIndeterminate(false);}}
            @Override public void onPageFinished(WebView view,String url){progress.setVisibility(View.GONE);}
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())webError("Нет связи с каталогом. Проверьте интернет и нажмите «Повторить».");}
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response){if(request.isForMainFrame()&&response.getStatusCode()>=400)webError("Сервер временно не открыл эту страницу. Попробуйте ещё раз.");}
            @Override public void onReceivedSslError(WebView view,android.webkit.SslErrorHandler handler,android.net.http.SslError error){handler.cancel();webError("Не удалось проверить защищённое соединение. Открытие остановлено.");}
            @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){webHost.removeView(view);view.destroy();webView=null;webError("Телефон освободил память просмотрщика. Закройте другие приложения и повторите загрузку модели.");return true;}
        });
        webView.setWebChromeClient(new WebChromeClient(){
            @Override public void onProgressChanged(WebView v,int value){progress.setProgress(value);}
            @Override public boolean onCreateWindow(WebView v,boolean dialog,boolean gesture,Message result){
                if(!gesture)return false;
                WebView child=new WebView(MainActivity.this);
                child.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest request){String u=request.getUrl().toString();if(Urls.sameHost(u))openWeb(u,"Проект");else if(Urls.web(u))external(u);child.destroy();return true;}});
                ((WebView.WebViewTransport)result.obj).setWebView(child);result.sendToTarget();return true;
            }
            @Override public void onShowCustomView(View view,CustomViewCallback callback){
                if(customView!=null){callback.onCustomViewHidden();return;}customView=view;customCallback=callback;screen.setVisibility(View.GONE);root.addView(view,new FrameLayout.LayoutParams(-1,-1));
                getWindow().getInsetsController().hide(WindowInsets.Type.systemBars());getWindow().getInsetsController().setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
            @Override public void onHideCustomView(){hideCustom();}
        });
        webView.setDownloadListener((url,agent,disposition,mime,length)->{
            if(Urls.web(url))download(url,URLUtil.guessFileName(url,disposition,mime),mime);
            else toast("Для сохранения снимка откройте этот проект в браузере через меню приложения.");
        });
    }
    private void webError(String text) {
        progress.setVisibility(View.GONE);
        if(!showingWeb)return;
        for(int i=webHost.getChildCount()-1;i>=0;i--)if(webHost.getChildAt(i)!=webView)webHost.removeViewAt(i);
        LinearLayout error=column();error.setPadding(dp(30),dp(30),dp(30),dp(30));error.setGravity(Gravity.CENTER);error.setBackgroundColor(BG);
        error.addView(this.text("Не удалось открыть 3D",23,INK));TextView explanation=this.text(text,16,MUTED);explanation.setPadding(0,dp(16),0,dp(16));error.addView(explanation);
        error.addView(button("Повторить",true,v->{String url=currentUrl;String title=heading.getText().toString();openWeb(url,title);}));
        error.addView(button("Вернуться в каталог",false,v->showCatalog()));webHost.addView(error,new FrameLayout.LayoutParams(-1,-1));
    }
    private void openWeb(String url,String title) {
        if(!Urls.sameHost(url))return;
        ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(search.getWindowToken(),0);
        ensureWeb();for(int i=webHost.getChildCount()-1;i>=0;i--)if(webHost.getChildAt(i)!=webView)webHost.removeViewAt(i);
        showingWeb=true;catalog.setVisibility(View.GONE);webHost.setVisibility(View.VISIBLE);heading.setText(title);backButton.setVisibility(View.VISIBLE);currentUrl=url;webView.loadUrl(url);
    }
    private void hideCustom(){if(customView==null)return;root.removeView(customView);customView=null;screen.setVisibility(View.VISIBLE);getWindow().getInsetsController().show(WindowInsets.Type.systemBars());if(customCallback!=null){customCallback.onCustomViewHidden();customCallback=null;}}
    private void showCatalog(){hideCustom();showingWeb=false;if(webView!=null){webView.stopLoading();webView.loadUrl("about:blank");webView.clearHistory();}if(webHost!=null)webHost.setVisibility(View.GONE);catalog.setVisibility(View.VISIBLE);heading.setText("Форма");currentUrl=Urls.CATALOG;backButton.setVisibility(View.INVISIBLE);progress.setVisibility(View.GONE);}
    @Override public void onBackPressed(){goBack();}
    private void goBack(){if(customView!=null){hideCustom();return;}if(showingWeb){showCatalog();return;}finish();}
    private void share(){shareUrl(showingWeb?currentUrl:Urls.CATALOG);}
    private void shareUrl(String url){Intent send=new Intent(Intent.ACTION_SEND);send.setType("text/plain");send.putExtra(Intent.EXTRA_TEXT,url);startActivity(Intent.createChooser(send,"Поделиться проектом"));}
    private void external(String url){if(!Urls.web(url))return;try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(ActivityNotFoundException e){toast("На телефоне нет приложения для этой ссылки.");}}
    private void menu(View anchor){
        PopupMenu p=new PopupMenu(this,anchor);p.getMenu().add(0,1,0,"Обновить каталог");p.getMenu().add(0,2,1,"Все проекты");p.getMenu().add(0,3,2,"Открыть в браузере");p.getMenu().add(0,5,3,"Проверить обновления");p.getMenu().add(0,4,4,"О приложении");
        p.setOnMenuItemClickListener(item->{switch(item.getItemId()){
            case 1:if(showingWeb)openWeb(currentUrl,heading.getText().toString());else loadProjects();break;
            case 2:showCatalog();break;
            case 3:external(showingWeb?currentUrl:Urls.CATALOG);break;
            case 5:checkUpdates(true);break;
            case 4:new AlertDialog.Builder(this).setTitle("Форма · "+installedVersion()).setMessage("Каталог проектов, документы и 3D-модели. Файлы загружаются с GitHub.\n\nМодели и PDF хранятся на GitHub. Для открытия нужен интернет.\n\nОдин палец — вращение, два — сдвиг и масштаб.\n\nВ этой версии доступен публичный просмотр. Изменения публикуются владельцем каталога.\n\nНовые версии проверяются при открытии приложения. Скачать и установить обновление можно с вашего подтверждения.").setPositiveButton("Понятно",null).show();break;
        }return true;});p.show();
    }
    private void toast(String text){Toast.makeText(this,text,Toast.LENGTH_LONG).show();}
    private String installedVersion(){try{return getPackageManager().getPackageInfo(getPackageName(),0).versionName;}catch(Exception e){return "";}}
    private void checkUpdates(boolean manual){
        if(checkingUpdate){if(manual)toast("Проверяем обновления…");return;}
        if(updateDialog!=null && updateDialog.isShowing())return;
        long now=System.currentTimeMillis();
        if(!manual && !UpdatePolicy.elapsed(now,getPreferences(0).getLong("updateCheckedAt",0),UpdatePolicy.CHECK_INTERVAL))return;
        checkingUpdate=true;if(manual)toast("Проверяем обновления…");
        worker.execute(()->{try{
            JSONObject release=new JSONObject(readUrl(Urls.ROOT+"/android/release.json?t="+now,32768));
            long code=release.getLong("versionCode");String name=release.getString("versionName");
            String url=UpdatePolicy.downloadUrl(name);
            if(!getPackageName().equals(release.getString("packageName")) || url.isEmpty() || !url.equals(release.getString("apkUrl")) || code<=0)throw new IOException("Invalid release");
            int min=release.getInt("minSdk");if(min<=0)throw new IOException("Invalid SDK");
            long installed=getPackageManager().getPackageInfo(getPackageName(),0).getLongVersionCode();
            String notes=release.optString("notes","");if(notes.length()>1500)notes=notes.substring(0,1500);final String description=notes;
            main.post(()->{
                checkingUpdate=false;if(isDestroyed() || isFinishing() || !resumed)return;
                getPreferences(0).edit().putLong("updateCheckedAt",System.currentTimeMillis()).apply();
                if(!UpdatePolicy.newer(installed,code,Build.VERSION.SDK_INT,min)){
                    if(manual)toast(code>installed?"Новая версия требует Android API "+min+" или новее.":"У вас актуальная версия приложения.");return;
                }
                if(!manual && !UpdatePolicy.remind(code,getPreferences(0).getLong("updateDeferredCode",0),System.currentTimeMillis(),getPreferences(0).getLong("updateDeferredAt",0)))return;
                Runnable later=()->getPreferences(0).edit().putLong("updateDeferredCode",code).putLong("updateDeferredAt",System.currentTimeMillis()).apply();
                updateDialog=new AlertDialog.Builder(this).setTitle("Доступно обновление · "+name)
                    .setMessage((description.isEmpty()?"Вышла новая версия приложения «Форма».":description)+"\n\nСкачайте APK и откройте его из «Загрузок». Android попросит подтвердить обновление. Удалять приложение не нужно.")
                    .setPositiveButton("Скачать обновление",(d,w)->{later.run();external(url);})
                    .setNegativeButton("Позже",(d,w)->later.run()).setOnCancelListener(d->later.run()).create();
                updateDialog.show();
            });
        }catch(Exception e){main.post(()->{checkingUpdate=false;if(manual && resumed && !isDestroyed())toast("Не удалось проверить обновления. Проверьте интернет и попробуйте ещё раз.");});}});
    }
    private byte[] bytesUrl(String url,int limit)throws IOException{
        String current=url;
        for(int redirects=0;redirects<4;redirects++){
            if(!Urls.sameHost(current))throw new IOException("Unexpected origin");
            HttpURLConnection c=(HttpURLConnection)new URL(current).openConnection();c.setConnectTimeout(15000);c.setReadTimeout(25000);c.setInstanceFollowRedirects(false);
            try{
                int status=c.getResponseCode();
                if(status>=300&&status<400){current=new URL(new URL(current),c.getHeaderField("Location")).toString();continue;}
                if(status!=200)throw new IOException("HTTP "+status);
                if(c.getContentLengthLong()>limit)throw new IOException("File too large");
                try(InputStream in=c.getInputStream();ByteArrayOutputStream data=new ByteArrayOutputStream()){
                    byte[] buffer=new byte[16384];int n;while((n=in.read(buffer))!=-1){if(data.size()+n>limit)throw new IOException("File too large");data.write(buffer,0,n);}return data.toByteArray();
                }
            }finally{c.disconnect();}
        }throw new IOException("Too many redirects");
    }
    private String readUrl(String url,int limit)throws IOException{return new String(bytesUrl(url,limit),java.nio.charset.StandardCharsets.UTF_8);}
    @Override protected void onPause(){resumed=false;main.removeCallbacks(updateTask);if(webView!=null)webView.onPause();super.onPause();}
    @Override protected void onResume(){super.onResume();resumed=true;if(webView!=null)webView.onResume();main.postDelayed(updateTask,1500);}
    @Override protected void onDestroy(){main.removeCallbacksAndMessages(null);worker.shutdownNow();if(webView!=null){webView.stopLoading();webView.destroy();}images.evictAll();super.onDestroy();}
}

