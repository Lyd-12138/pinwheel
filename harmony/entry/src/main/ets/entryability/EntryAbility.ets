import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { Lifecycle } from '../services/Lifecycle';

export default class EntryAbility extends UIAbility {
  onWindowStageCreate(stage: window.WindowStage): void {
    stage.loadContent('pages/Index');
  }
  onBackground(): void { Lifecycle.background?.(); }
  onForeground(): void { Lifecycle.foreground?.(); }
}
