// ============================================================
//  InputManager.ts — 键盘 + 鼠标 + 虚拟摇杆输入（Cocos Creator 3.x API）
// ============================================================
// PC：WASD/方向键移动、QER技能、Esc暂停、M属性面板。
// 移动端：TouchControls 把虚拟摇杆向量与技能按钮按下沿写进来，
// 两套输入在 moveX/moveY 与 isKey?Pressed() 里合并（键盘优先）。
import { _decorator, Component, Node, EventKeyboard, EventMouse, KeyCode, Input, input, Vec2 } from 'cc';
import { CANVAS_H } from '../core/Constants';
const { ccclass } = _decorator;

@ccclass('InputManager')
export class InputManager extends Component {
    private _keys: Set<number> = new Set();
    private _justPressed: Set<number> = new Set();
    mouse = { x: 640, y: 360, down: false };

    // ── 虚拟输入（由 TouchControls 写入） ────────────────────
    /** 虚拟摇杆方向（画布坐标系，y向下；长度已钳制到≤1）。 */
    private _stickX = 0;
    private _stickY = 0;
    /** 虚拟技能按钮的本帧按下沿：'q' | 'e' | 'r'。 */
    private _virtualPressed = new Set<string>();

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
    private _onMouseMove(e: EventMouse): void   { this.mouse.x = e.getLocationX(); this.mouse.y = CANVAS_H - e.getLocationY(); }
    private _onMouseDown(_e: EventMouse): void  { this.mouse.down = true; }
    private _onMouseUp(_e: EventMouse): void    { this.mouse.down = false; }

    lateUpdate(_dt: number): void {
        this._justPressed.clear();
        this._virtualPressed.clear();
    }

    isDown(code: KeyCode): boolean { return this._keys.has(code); }
    isAnyDown(...codes: KeyCode[]): boolean { return codes.some(c => this._keys.has(c)); }

    justPressed(name: string): boolean {
        const map: Record<string, number> = { 'Escape': 27 };
        const code = map[name];
        return code !== undefined && this._justPressed.has(code);
    }

    justPressedCode(code: number): boolean { return this._justPressed.has(code); }

    // ── 虚拟输入写入（TouchControls 调用） ───────────────────

    /** 写入虚拟摇杆方向；摇杆松开时传 (0,0)。 */
    setStick(x: number, y: number): void {
        this._stickX = x;
        this._stickY = y;
    }

    /** 虚拟技能按钮按下：与键盘同帧沿语义，lateUpdate 后清除。 */
    fireSkillPressed(slot: 'q' | 'e' | 'r'): void {
        this._virtualPressed.add(slot);
    }

    private _virtualPressedSlot(slot: string): boolean {
        return this._virtualPressed.has(slot);
    }

    // 键盘非零时优先键盘（两端同时输入时行为确定），否则取摇杆向量
    get moveX(): number {
        const k = (this.isAnyDown(KeyCode.KEY_D, KeyCode.ARROW_RIGHT) ? 1 : 0)
                - (this.isAnyDown(KeyCode.KEY_A, KeyCode.ARROW_LEFT)  ? 1 : 0);
        return k !== 0 ? k : this._stickX;
    }
    get moveY(): number {
        const k = (this.isAnyDown(KeyCode.KEY_S, KeyCode.ARROW_DOWN) ? 1 : 0)
                - (this.isAnyDown(KeyCode.KEY_W, KeyCode.ARROW_UP)   ? 1 : 0);
        return k !== 0 ? k : this._stickY;
    }

    isKeyQ(): boolean { return this.isDown(KeyCode.KEY_Q); }
    isKeyE(): boolean { return this.isDown(KeyCode.KEY_E); }
    isKeyR(): boolean { return this.isDown(KeyCode.KEY_R); }
    isKeyQPressed(): boolean { return this.justPressedCode(KeyCode.KEY_Q) || this._virtualPressedSlot('q'); }
    isKeyEPressed(): boolean { return this.justPressedCode(KeyCode.KEY_E) || this._virtualPressedSlot('e'); }
    isKeyRPressed(): boolean { return this.justPressedCode(KeyCode.KEY_R) || this._virtualPressedSlot('r'); }
    isKeyMPressed(): boolean { return this.justPressedCode(KeyCode.KEY_M); }
}
