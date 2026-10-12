"""敌人局部关节动作曲线；所有坐标仅影响身体画面，不参与伤害与碰撞。"""
import math
from PIL import Image

SIZE = 256
RANGED = {'archer','needle_gunner','rail_butcher','boss_invader'}
CASTERS = {'ember_acolyte','frost_acolyte','triune_priest'}
HEAVY = {'golem','bell_devourer','boss_ch1','boss_ch2','boss_mech','boss_invader'}
_SCALED = {}


def draw_part(canvas, part, height, pivot, joint, angle=0, tip=None):
    ratio = height/part.height
    w, h = max(1,round(part.width*ratio)), max(1,round(height))
    key = (id(part),h)
    if key not in _SCALED:
        _SCALED[key] = (part,part.resize((w,h),Image.Resampling.LANCZOS))
    small = _SCALED[key][1]
    layer = small
    px,py = pivot[0]*w,pivot[1]*h
    if abs(angle) > .01:
        layer = small.rotate(angle,Image.Resampling.BICUBIC,expand=True)
        a = math.radians(angle)
        dx,dy = px-w/2,py-h/2
        px=layer.width/2+math.cos(a)*dx+math.sin(a)*dy
        py=layer.height/2-math.sin(a)*dx+math.cos(a)*dy
    canvas.alpha_composite(layer,(round(joint[0]-px+128),round(joint[1]-py+128)))
    if tip is not None:
        dx,dy=(tip[0]-pivot[0])*w,(tip[1]-pivot[1])*h
        a=math.radians(angle)
        return (joint[0]+math.cos(a)*dx+math.sin(a)*dy,joint[1]-math.sin(a)*dx+math.cos(a)*dy)
    return w,h


def render_pose(parts, view, action, t, unit, markers=None):
    uid, kind = unit.get('sourceId', unit['id']), unit['rig']
    canvas = Image.new('RGBA',(SIZE*2,SIZE*2))
    side, back = view == 'side', view == 'back'
    moving = action in ('walk','run')
    cycle = t*math.tau
    speed = 1.30 if action == 'run' else 1
    step = math.sin(cycle)*speed if moving else 0
    breath = math.sin(cycle)*.8 if action == 'idle' else 0
    attack = action in ('attack','attackMelee') or action.startswith('skill')
    power = math.sin(t*math.pi) if attack else 0
    skill = int(action[-1]) if action[-1:].isdigit() else 1
    hurt = math.sin(t*math.pi) if action == 'hit' else 0
    fall = min(1,t*1.5) if action == 'defeated' else 0
    jump = math.sin(t*math.pi)*24 if action == 'jump' else 0
    bob = (-abs(math.sin(cycle))*2 if moving else breath)-jump+fall*15
    lean = 0
    # 全身根只允许小幅重心位移。发力来自肢体，不把整图压扁当动作。
    shift = -hurt*5 + (power*3 if attack else 0)
    torso_part = parts[5] if unit.get('finalForm') else parts[0]
    if power > .55 and ((uid in {'boss_ch1','boss_ch2','boss_mech','boss_invader'} and action in ('skill3','skill4'))
                       or uid in {'bell_devourer','boss_ch3','boss_ch4','boss_abyss','boss_vespa','boss_manyfold','boss_crucible_city','acid_sac','squid','jelly','rivet_beast'}
                       or (uid == 'rust_biter' and not back)
                       or (uid == 'chain_hound' and not back)
                       or (uid == 'prism_snail' and action == 'skill2')):
        torso_part = parts[5]
    if attack and skill == 2:
        lean = -power*9
    if kind == 'biped':
        body_h = 139 if uid in HEAVY else 143
        body_w = parts[0].width/parts[0].height*body_h
        body_x, body_y = 123+shift,105+bob
        left = body_x-body_w/2
        if side:
            shoulders = [(left+body_w*.73,86),(left+body_w*.27,88)]
            hips = [(118,162),(131,163)]
        elif back:
            shoulders = [(left+body_w*.85,88),(left+body_w*.16,91)]
            hips = [(142,162),(113,164)]
        else:
            shoulders = [(left+body_w*.14,91),(left+body_w*.94,105)]
            hips = [(113,161),(139,163)]
        arm_h = 96 if uid in RANGED else 104
        if uid == 'boss_mech': arm_h=129
        if uid == 'miniboss': arm_h=98
        if uid == 'grunt': arm_h = 91
        if uid == 'shield': arm_h = 109
        leg_h = 72 if uid in HEAVY else 77
        if uid == 'boss_mech': leg_h=81
        ap = (.65,.14) if back else (.32,.15)
        lp = (.65,.14) if back else (.43,.13)
        angles = [-step*12,step*13]
        if attack:
            angles = [-power*27,power*67]
            if uid in RANGED:
                angles = [-power*8,power*5]
                shift -= power*5
            elif uid == 'shield': angles = [-power*22,power*9]
            elif uid in CASTERS: angles = [-power*38,power*42]
            elif uid in {'elite_grunt','miniboss','boss_mech'}: angles = [-power*55,power*75]
            elif uid in {'golem','boss_ch2'}: angles = [power*45,power*58]
            if action.startswith('skill'):
                angles = {1:angles,2:[-power*12,power*18],3:[-power*74,power*76],
                          4:[-power*105,power*105],5:[power*75,-power*70]}[skill]
        angles = [a+fall*40+hurt*12 for a in angles]
        if uid == 'shield':
            near_pivot = (.30,.52)
        elif uid in RANGED:
            near_pivot = (.20,.30) if not back else (.55,.20)
        else: near_pivot = ap
        def arm(i):
            j = shoulders[i]
            dx = power*6 if uid == 'shield' and i == 1 else 0
            height=arm_h
            if uid in RANGED and i:
                height=min(height,91*parts[i+1].height/parts[i+1].width)
            tip=(.92,.55) if not back else (.12,.48)
            point=draw_part(canvas,parts[i+1],height,near_pivot if i else ap,
                            (j[0]+shift+dx,j[1]+bob),angles[i],tip)
            if i and markers is not None: markers['muzzle']=point
            return point
        # 双腿都插在骨盆后方，避免独立髋盖浮在腰带表面。
        for i in (0,1):
            phase = cycle+i*math.pi
            stride = math.sin(phase)*speed if moving else 0
            lift = max(0,math.sin(phase))*9 if moving else 0
            draw_part(canvas,parts[i+3],leg_h,lp,
                      (hips[i][0]+stride*3+shift,hips[i][1]+bob-lift+fall*5),
                      stride*17-fall*35)
        arm(0)
        body = torso_part
        # 可见阶段附件仅在身体稿确实提供整段躯干时替换。
        if action in ('skill4','skill5') and power > .55 and uid in HEAVY and unit.get('alternateTorso'):
            body = parts[5]
        draw_part(canvas,body,body_h,(.5,.5),(body_x,body_y),lean+hurt*5+fall*-17)
        arm(1)
    elif kind == 'prism':
        retract = power if action == 'skill2' else 0
        for i in (0,1):
            draw_part(canvas,parts[i+3],25,(.5,.5),(100+i*51,188+bob),step*(3 if i else -3))
        draw_part(canvas,parts[0],68*(1-retract*.3),(.5,.5),(139-retract*15,168+bob),hurt*6)
        shell=parts[5] if retract>.4 else parts[1]
        draw_part(canvas,shell,132,(.5,.5),(118,117+bob),power*7 if action!='skill2' else 0)
    elif kind == 'foundry':
        # 六活塞腿、三炉环和三支不同长度的打桩臂分别运动。
        for i in range(6):
            a=i*math.tau/6
            stride=math.sin(cycle+i*math.pi/3)*speed if moving else 0
            draw_part(canvas,parts[3],60,(.5,.10),
                      (128+math.cos(a)*60,156+math.sin(a)*21+bob-max(0,stride)*5),stride*7)
        for i in range(3):
            h=min([88,53,65][i],155*parts[i].height/parts[i].width)
            draw_part(canvas,parts[i],h,(.5,.5),(128,151-i*27+bob),
                      math.sin(cycle)*(2 if i%2 else -2)+power*(4 if i%2 else -4))
        for i,(x,y,h) in enumerate([(89,111,75),(123,89,93),(158,111,61)]):
            hammer=max(0,math.sin(t*math.pi*3-i*.9)) if attack else 0
            draw_part(canvas,parts[4 if i<2 else 5],h,(.24 if not back else .76,.88),
                      (x,y+bob+hammer*7),hammer*(-18 if i%2 else 18))
    elif kind == 'bell':
        # 悬钟本体稳住，四条短肢抱住钟缘，心核独立摆动。
        for i in range(4):
            x=73 if i%2==0 else 183
            draw_part(canvas,parts[1 if i<2 else (2 if i==2 else 4)],35,(.5,.15),
                      (x,140+(i//2)*14+bob),power*(15 if i%2 else -15)+fall*35)
        draw_part(canvas,torso_part,139,(.5,.5),(128,113+bob),hurt*5)
        draw_part(canvas,parts[3],54,(.5,.08),(128,123+bob),math.sin(cycle)*16+power*28)
    elif kind == 'spool':
        # 六镜肢围绕线轴折叠，不使用袍尾或类人手臂。
        for i in range(6):
            a=i*math.tau/6 + (math.sin(cycle)*.08 if moving else 0)
            radius=24+power*13
            x=128+math.cos(a)*radius; y=129+math.sin(a)*radius*.72+bob
            part=parts[1+i%4]
            left_root=i%4==2 or (back and i%4==0)
            pivot=(.22,.12) if left_root else (.77,.12)
            tip_x=.94 if left_root else .06
            base_angle=math.degrees(math.atan2(.86*part.height,(tip_x-pivot[0])*part.width))
            draw_part(canvas,part,91,(pivot[0],pivot[1]),(x,y),
                      base_angle-math.degrees(a)+ (25 if i%2 else -25)*power+fall*30)
        draw_part(canvas,torso_part,79,(.5,.5),(128,123+bob),hurt*6)
    elif kind == 'leech':
        # 菱形单眼的导线负责摆动，主体不随电缆变成直立人形。
        for i in (0,1):
            swing=math.sin(cycle-i)*10
            draw_part(canvas,parts[i+3],100,(.45,.08),(116+i*23,135+bob),swing+power*(18 if i else -18))
        body=parts[5] if power>.6 else parts[0]
        draw_part(canvas,body,105,(.5,.5),(128,100+bob),-step*4+hurt*8)
        if markers is not None:markers['muzzle']=(143 if side else 128,102+bob)
    elif kind == 'triune':
        # 三相分离甲片，施法时对应核心前移扩大，其他两相保持退后。
        for i,(x,y) in enumerate([(128,83),(86,150),(169,149)]):
            active=attack and (skill-1)%3==i
            part=parts[5] if active and i==0 and power>.55 else parts[i]
            draw_part(canvas,part,73+power*12 if active else 73,(.5,.5),
                      (x+(power*8 if active else 0),y+bob+math.sin(cycle+i)*3),hurt*8+fall*(i-1)*30)
        draw_part(canvas,parts[3],88,(.5,.5),(195,148+bob),power*30)
        draw_part(canvas,parts[4],24,(.5,.5),(128,198+bob),math.sin(cycle)*8)
    elif kind == 'tripod':
        # 三脚低矮枪架：支腿错相迈步，针管沿轴后坐，不套人形双臂。
        for i,(x,y) in enumerate([(104,157),(148,163),(124,150)]):
            stride=math.sin(cycle+i*math.tau/3)*speed if moving else 0
            draw_part(canvas,parts[i+1],57,(.5,.10),(x+shift,y+bob-max(0,stride)*7),stride*12+fall*27)
        draw_part(canvas,parts[0],48,(.5,.5),(126+shift,153+bob),hurt*8)
        cannon=parts[5] if power>.65 else parts[4]
        ch=min(66,168*cannon.height/cannon.width)
        point=draw_part(canvas,cannon,ch,(.35,.52),(122-power*8,129+bob),-hurt*6,(.97,.55))
        if markers is not None:markers['muzzle']=point
    elif kind == 'ember':
        # 炉芯独立悬浮，杖臂绕肘抬起，电缆斗篷与步足错相。
        for i in (0,1):
            stride=step*(1 if i else -1)
            draw_part(canvas,parts[i+3],59,(.5,.12),(115+i*24,170+bob-max(0,stride)*6),stride*16+fall*30)
        draw_part(canvas,parts[1],73,(.5,.13),(100,119+bob),-power*40-step*6)
        draw_part(canvas,parts[0],100,(.5,.5),(128,143+bob),hurt*7-fall*18)
        draw_part(canvas,parts[5],44,(.5,.5),(128,68+bob+math.sin(cycle)*3),-power*7)
        draw_part(canvas,parts[2],151,(.35,.46),(153,124+bob),power*22-step*3)
    elif kind == 'spider':
        # 维斯帕：四矛足与四弹簧足。躯干只占展开轮廓的三分之一。
        crouch = math.sin(t*math.pi)*12 if action in ('jump','skill2') else 0
        height = 78
        def spider_legs(near):
            for i in range(4):
                phase = cycle + i*math.pi*.5 + (math.pi if near else 0)
                stride = math.sin(phase)*speed if moving else 0
                index = (2 if near else 1) if i<2 else (4 if near else 3)
                x = 140 if near else 116
                y = 120+i*8+bob+crouch
                vx,vy=[(65,-45),(78,-5),(67,40),(44,72)][i]
                if not near: vx=-vx
                if side: vy*=.7
                spread=90-math.degrees(math.atan2(vy,vx))
                strike = power*12*(1 if near else -1) if i<2 else -crouch*.5
                draw_part(canvas,parts[index],90 if i<2 else 83,(.47,.13),
                          (x+shift,y-max(0,stride)*7),spread+stride*13+strike+fall*28)
        spider_legs(False)
        spider_legs(True)
        draw_part(canvas,torso_part,height,(.5,.5),(128+shift,125+bob+crouch),lean-fall*15)
    elif kind == 'crystal':
        # 三棱公转，出手时统一朝目标收束；躯干留空，不能重新拼成人形。
        draw_part(canvas,parts[0],88,(.5,.5),(128+shift,130+bob),hurt*8)
        for i in range(3):
            a=i*math.tau/3 + (math.sin(cycle)*.18 if not attack else -power*.3)
            x=128+math.cos(a)*60; y=129+math.sin(a)*49+bob
            rotation=(i*120-90)*(1-power) + (0 if side else -35)*power
            draw_part(canvas,parts[i+1],52 if i<2 else 66,(.5,.5),(x+power*12,y),rotation+fall*40)
        if markers is not None: markers['muzzle']=(188+power*12,129+bob)
    elif kind == 'quadruped':
        # 四足相位采用对角配对；背部不随四条腿同时跳动。
        body_h = min(118,(202 if uid=='chain_hound' else 174)*parts[0].height/parts[0].width)
        body_w = body_h*parts[0].width/parts[0].height
        positions = [(161,153),(166,168),(86,153),(91,171)] if side else [(92,149),(163,154),(99,176),(154,181)]
        if back: positions = [(161,153),(88,158),(150,179),(96,184)]
        if uid == 'chain_hound':
            # 尾链占据后半幅，四足须接在躯干而非尾端。
            positions = [(163,146),(166,157),(123,146),(126,158)] if not back else [(115,116),(143,118),(113,148),(142,151)]
        if uid=='rust_biter' and not back:
            positions=[(147,150),(165,157),(83,149),(93,162)]
        if uid=='miniboss':
            positions=[(159,143),(167,155),(100,139),(111,151)] if not back else [(150,132),(159,143),(105,139),(116,151)]
        order = [0,2,1,3]
        def leg(i):
            p = cycle+(0 if i in (0,3) else math.pi)
            s = math.sin(p)*speed if moving else 0
            attack_a = power*(24 if i<2 else -18)
            leg_h=52 if uid=='chain_hound' else (81 if uid=='rust_biter' and i<2 else 63)
            if uid=='miniboss':leg_h=58
            pivot=(.48,.15)
            if uid=='acid_sac' and i<2:
                leg_h=min(60,96*parts[i+1].height/parts[i+1].width)
                pivot=(.10,.16) if not back else (.80,.16)
                attack_a=power*48
            point=draw_part(canvas,parts[i+1],leg_h,pivot,
                      (positions[i][0]+shift,positions[i][1]+bob-max(0,s)*8+fall*7),
                      s*18+attack_a+fall*35,(.91,.70))
            if uid=='acid_sac' and i==1 and markers is not None:markers['muzzle']=point
        leg(0);leg(2)
        draw_part(canvas,torso_part,body_h,(.5,.5),(127+shift,132+bob+power*4),lean-fall*12)
        leg(1);leg(3)
        if markers is not None and uid!='acid_sac':
            markers['muzzle']=(127+shift+(body_w*.40 if side else body_w*.22),132+bob+power*4)
    elif kind == 'crawler':
        body_h = min(139,166*parts[0].height/parts[0].width)
        low_tick=uid=='blast_tick'
        if low_tick: body_h=min(74,body_h)
        count = 3
        # 虾的前爪独立发力；蛛/蜱的三对足按三角支撑组错相。
        claws = uid == 'shrimp' or uid == 'boss_vespa'
        def legs(near):
            for i in range(count):
                p = cycle+i*2.094+(math.pi if near else 0)
                s = math.sin(p)*speed if moving else 0
                x = 91+i*31
                y = (171 if near else 151)+bob
                if not side: x = (153+i*6 if near else 100-i*6)
                index = (4 if near else 3) if i else (2 if near else 1)
                height = 64 if not (claws and i==0) else 88
                if low_tick: height=42
                if uid=='shrimp':
                    height=109 if i==0 else 55
                    if i==0:x=161 if near else 146;y=141+bob
                angle = (s*15+power*22 if i else s*10+power*55)*(1 if near else -1)
                draw_part(canvas,parts[index],height,(.52,.16),(x+shift,y-max(0,s)*7),angle+fall*40)
        legs(False)
        body=parts[5] if low_tick and attack and power>.45 else torso_part
        draw_part(canvas,body,body_h,(.5,.5),(126+shift,(151 if low_tick else 127)+bob-power*4),lean-fall*13)
        legs(True)
    elif uid == 'squid':
        # 长锥外套膜与六腕汇于喙下，水刺从漏斗口释放。
        root=(174,138) if side else ((126,151) if back else (106,151))
        cast_lift=power*(8 if skill==2 else 3)
        for i in range(6):
            index=1+i%4
            px=.82 if back and index in (1,3) else .12
            angle=(-65+i*9 if side else -145+i*13)
            if back and index in (1,3):angle=-angle
            swing=math.sin(cycle-i*.7)*8
            draw_part(canvas,parts[index],95 if i<4 else 114,(px,.94),
                      (root[0]+(i-2.5)*3,root[1]+bob-cast_lift),angle+swing+power*(i-2.5)*5)
        h=min(114,159*parts[0].height/parts[0].width)
        draw_part(canvas,torso_part,h,(.5,.5),(128,105+bob-cast_lift),hurt*6)
        if markers is not None:markers['muzzle']=(root[0]+5,root[1]+bob-cast_lift)
    elif kind in ('tentacle','hover'):
        body_h = 128 if kind == 'hover' else 126
        if uid=='jelly':body_h=82
        body_h = min(body_h,158*parts[0].height/parts[0].width)
        bob += math.sin(cycle)*2 if action in ('idle','walk','run') else 0
        tentacles = 4 if kind == 'tentacle' else 2
        for i in range(tentacles):
            swing = math.sin(cycle-i*.9)*9 if action in ('idle','walk','run') else 0
            x = 98+i*20 if tentacles==4 else 112+i*31
            draw_part(canvas,parts[3+i%2],96 if uid=='jelly' else 70,(.5,.12),(x,140+bob if uid=='jelly' else 155+bob),swing+power*(18 if i%2 else -18)+fall*35)
        draw_part(canvas,parts[1],89,(.5,.15),(87,122+bob),-power*(30+skill*11)+step*7)
        draw_part(canvas,torso_part,body_h,(.5,.5),(126+shift,107+bob+fall*8),lean-hurt*7-fall*18)
        point=draw_part(canvas,parts[2],89,(.5,.15),(162,129+bob),power*(35+skill*10)-step*7+fall*25,(.5,.90))
        if markers is not None: markers['muzzle']=point
    elif kind == 'drone':
        body_h = min(104,143*parts[0].height/parts[0].width)
        bob += math.sin(cycle)*2
        for i in (0,1):
            x = 88 if not i else 162
            point=draw_part(canvas,parts[i+3],62,(.5,.16),(x,139+bob+power*(-8 if i==0 else -5)),power*(8 if uid=='drone_a' else 40),(.5,.9))
            if markers is not None and i: markers['muzzle']=point
        draw_part(canvas,parts[1],64,(.5,.4),(81,120+bob),step*4+fall*30)
        draw_part(canvas,parts[0],body_h,(.5,.5),(126,112+bob+fall*25),-step*3-hurt*7)
        draw_part(canvas,parts[2],64,(.5,.4),(176,130+bob),-step*4-fall*25)
    if fall:
        # 保留关节塌落；末态围绕身体中部倾倒，固定脚底基准且不裁边。
        angle = -fall*(63 if kind=='biped' else 26)
        canvas = canvas.rotate(angle,Image.Resampling.BICUBIC,center=(256,271))
    return canvas
