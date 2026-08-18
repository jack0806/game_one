// ============================================================
//  InputManager.ts — 键盘 + 鼠标输入（Cocos Creator 3.x API）
// ============================================================
import { _decorator, Component, Node, EventKeyboard, EventMouse, KeyCode, Input, input, Vec2 } from 'cc';
const { ccclass } = _decorator;

@ccclass('InputManager')
export class InputManager extends Component {
    private _keys: Set<number> = new Set();
    private _justPressed: Set<number> = new Set();
    mouse = { x: 640, y: 360, down: false };

    onLoad(): void {
        input.on(Input.EventType.KEY_DOWN,  this._onKeyDown,  this);
        input.on(Input.EventType.KEY_UP,    this._onKeyUp,    this);
        input.on(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
        input.on(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
        input.on(Input.EventType.MOUSE_UP,   this._onMouseUp,   this);
    }

    onDestroy(): void {
        input.off(Input.EventType.KEY_DOWN,  this._onKeyDown,  this);
        input.off(Input.EventType.KEY_UP,    this._onKeyUp,    this);
        input.off(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
        input.off(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
        input.off(Input.EventType.MOUSE_UP,   this._onMouseUp,   this);
    }

    private _onKeyDown(e: EventKeyboard): void  {
        if (!this._keys.has(e.keyCode)) this._justPressed.add(e.keyCode);
        this._keys.add(e.keyCode);
    }
    private _onKeyUp(e: EventKeyboard): void    { this._keys.delete(e.keyCode); }
    private _onMouseMove(e: EventMouse): void   { this.mouse.x = e.getLocationX(); this.mouse.y = 720 - e.getLocationY(); }
    private _onMouseDown(_e: EventMouse): void  { this.mouse.down = true; }
    private _onMouseUp(_e: EventMouse): void    { this.mouse.down = false; }

    lateUpdate(_dt: number): void {
        this._justPressed.clear();
    }

    isDown(code: KeyCode): boolean { return this._keys.has(code); }
    isAnyDown(...codes: KeyCode[]): boolean { return codes.some(c => this._keys.has(c)); }

    justPressed(name: string): boolean {
        const map: Record<string, number> = { 'Escape': 27 };
        const code = map[name];
        return code !== undefined && this._justPressed.has(code);
    }

    justPressedCode(code: number): boolean { return this._justPressed.has(code); }

    get moveX(): number {
        return (this.isAnyDown(KeyCode.KEY_D, KeyCode.ARROW_RIGHT) ? 1 : 0)
             - (this.isAnyDown(KeyCode.KEY_A, KeyCode.ARROW_LEFT)  ? 1 : 0);
    }
    get moveY(): number {
        return (this.isAnyDown(KeyCode.KEY_S, KeyCode.ARROW_DOWN) ? 1 : 0)
             - (this.isAnyDown(KeyCode.KEY_W, KeyCode.ARROW_UP)   ? 1 : 0);
    }

    isKeyQ(): boolean { return this.isDown(KeyCode.KEY_Q); }
    isKeyE(): boolean { return this.isDown(KeyCode.KEY_E); }
    isKeyR(): boolean { return this.isDown(KeyCode.KEY_R); }
    isKeyQPressed(): boolean { return this.justPressedCode(KeyCode.KEY_Q); }
    isKeyEPressed(): boolean { return this.justPressedCode(KeyCode.KEY_E); }
    isKeyRPressed(): boolean { return this.justPressedCode(KeyCode.KEY_R); }
    isDash(): boolean { return this.isAnyDown(KeyCode.SHIFT_LEFT, KeyCode.SHIFT_RIGHT, KeyCode.SPACE); }
    isDashPressed(): boolean {
        return [KeyCode.SHIFT_LEFT, KeyCode.SHIFT_RIGHT, KeyCode.SPACE]
            .some(code => this.justPressedCode(code));
    }
}
