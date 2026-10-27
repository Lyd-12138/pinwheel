import { webview } from '@kit.ArkWeb';
import { common } from '@kit.AbilityKit';
import { NativeBridge, trustedPage } from '../services/Bridge';
import { Lifecycle } from '../services/Lifecycle';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private bridge: NativeBridge = new NativeBridge(this.getUIContext().getHostContext() as common.UIAbilityContext, this.controller);
  private lockTimer: number = -1;
  @State covered: boolean = false;
  @StorageLink('pinwheelLanguage') language: string = 'en';
  aboutToAppear(): void {
    Lifecycle.background = () => {
      clearTimeout(this.lockTimer);
      this.covered = true;
      this.controller.runJavaScript('window.pinwheelSuspend?.()').catch(() => {});
      this.lockTimer = setTimeout(() => this.bridge.forgetAfterPending(), 5000);
    };
    Lifecycle.foreground = () => {
      clearTimeout(this.lockTimer);
      this.covered = false;
      this.controller.runJavaScript('window.pinwheelResume?.()').catch(() => {});
    };
  }
  aboutToDisappear(): void {
    clearTimeout(this.lockTimer); this.bridge.dispose(); Lifecycle.background = undefined; Lifecycle.foreground = undefined;
    this.controller.deleteJavaScriptRegister('PinwheelNative');
  }
  onBackPress(): boolean { this.controller.runJavaScript('window.pinwheelBack?.()').catch(() => {}); return true; }
  build() {
    Stack() {
      Web({ src: $rawfile('web/index.html'), controller: this.controller })
        .javaScriptAccess(true)
        .domStorageAccess(false)
        .fileAccess(false)
        .javaScriptProxy({ object: this.bridge, name: 'PinwheelNative', methodList: ['post'], controller: this.controller })
        .onLoadIntercept((event) => { return event ? !trustedPage(event.data.getRequestUrl()) : true; })
        .onWindowNew(() => {})
        .width('100%').height('100%')
      if (this.covered) { Column() { Text(this.language === 'zh-CN' ? '风车笔记' : 'pinwheel').fontSize(28).fontColor('#586779') }.justifyContent(FlexAlign.Center).width('100%').height('100%').backgroundColor('#FFFFFF') }
    }.width('100%').height('100%').backgroundColor('#FFFFFF')
  }
}
