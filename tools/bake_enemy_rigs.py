"""把已绘制的透明关节部件离线烘焙成敌人动作；不生成/改画部件内容。"""
from pathlib import Path
import argparse
import json
import math
import io
import time
import numpy as np
from scipy import ndimage
from PIL import Image
from enemy_rig_motion import render_pose

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'docs/art/style-a/enemy-redesign'
SIZE = 256
VIEWS = ['front', 'side', 'back']

def save_png(picture, path, **options):
    data=io.BytesIO();picture.save(data,format='PNG',**options)
    for attempt in range(30):
        try:
            path.write_bytes(data.getvalue());return
        except OSError:
            if attempt==29: raise
            time.sleep(.2)


def calibrate(parts,unit):
    grounded = unit['rig'] in ('biped','quadruped','crawler','spider','tripod','ember','foundry','prism')
    dy={}
    scale=1.0
    for view in VIEWS:
        idle=render_pose(parts[view],view,'idle',0,unit)
        b=idle.getchannel('A').getbbox()
        dy[view]=212-(b[3]-128) if grounded else -12
        for action in ('walk','run','jump','attack','hit','defeated','skill2','skill3','skill4','skill5'):
            for t in (0,.125,.25,.375,.5,.625,.75,.875,1):
                raw=render_pose(parts[view],view,action,t,unit)
                b=raw.getchannel('A').getbbox()
                x0,y0,x1,y1=b[0]-128,b[1]-128+dy[view],b[2]-128,b[3]-128+dy[view]
                if x0<128: scale=min(scale,120/(128-x0))
                if x1>128: scale=min(scale,120/(x1-128))
                if y0<212: scale=min(scale,204/(212-y0))
                if y1>212: scale=min(scale,36/(y1-212))
    return {'scale':scale,'dy':dy}


def framed_pose(parts,view,action,t,unit,calibration,markers=None):
    raw=render_pose(parts,view,action,t,unit,markers)
    s=calibration['scale'];dy=calibration['dy'][view]
    raw=raw.resize((round(512*s),round(512*s)),Image.Resampling.LANCZOS)
    dest=Image.new('RGBA',(SIZE,SIZE))
    dest.alpha_composite(raw,(round(128-256*s),round(212-(340-dy)*s)))
    if markers is not None and 'muzzle' in markers:
        x,y=markers['muzzle'];markers['muzzle']=[(128+(x-128)*s)/SIZE,(212+(y+dy-212)*s)/SIZE]
    return dest


def extract_parts(path):
    source = Image.open(path).convert('RGBA')
    # 生成稿的网格留白不一定等宽，按真实透明连通域找18个部件，不能硬切掉长枪/兽头。
    labels, count = ndimage.label(np.asarray(source.getchannel('A')) > 32)
    weights = np.bincount(labels.ravel()); weights[0] = 0
    objects = ndimage.find_objects(labels)
    largest = sorted(range(1,count+1),key=lambda i:weights[i],reverse=True)[:18]
    if len(largest) != 18:
        raise ValueError(f'{path.name}: need 18 components, got {len(largest)}')
    boxes = []
    for i in largest:
        ys,xs = objects[i-1]
        boxes.append((xs.start,ys.start,xs.stop,ys.stop))
    boxes.sort(key=lambda b:(b[1]+b[3])/2)
    result = {}
    for row,view in enumerate(VIEWS):
        row_boxes = sorted(boxes[row*6:row*6+6],key=lambda b:b[0])
        result[view] = [source.crop(b) for b in row_boxes]
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('unit', nargs='?', default='all')
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    out = WORK / 'qa'
    out.mkdir(exist_ok=True)
    units = json.loads((WORK/'production.json').read_text(encoding='utf8'))['units']
    baseline = {u['id']:u for u in json.loads((WORK/'baseline.json').read_text(encoding='utf8'))['units']}
    if args.unit in ('all','boss_invader'):
        invader=next(u for u in units if u['id']=='boss_invader')
        units.append({**invader,'id':'boss_invader_final','sourceId':'boss_invader','finalForm':True})
        baseline['boss_invader_final']={**baseline['boss_invader'],'key':'enemy_boss_final'}
    exported = {}
    summaries = []
    roster = Image.new('RGBA',(256*6,256*math.ceil(len(units)/6)),'#354454')
    for n,unit in enumerate(units):
        uid = unit['id']
        if args.unit != 'all' and uid not in args.unit.split(',') and unit.get('sourceId') not in args.unit.split(','): continue
        path = WORK/'rigs'/f"{unit.get('sourceId',uid)}.png"
        if not path.exists(): continue
        parts = extract_parts(path)
        calibration=calibrate(parts,unit)
        base = baseline[uid]
        idle_boxes = [framed_pose(parts[v],v,'idle',0,unit,calibration).getbbox() for v in VIEWS]
        extent = max(max(b[2]-b[0], b[3]-b[1]) for b in idle_boxes)
        # 按不透明身体而非图集留白制定体形层级，碰撞半径和伤害数值保持原样。
        tier = base['category']
        low,high = {'grunt':(34,57),'miniboss':(82,105),'boss':(140,155)}[tier]
        target = max(low,min(high,base['size']*.8))
        display_scale = target/(base['size']*extent/SIZE)
        sheets = {}
        # 三方向同一尺寸、同一脚底。不逐帧按包围盒重新居中。
        for view in VIEWS:
            old = base['clips'].get(view,{})
            actions = list(old) or ['idle','walk','run','jump','attack','hit','defeated','skill']
            if uid.startswith('boss_invader'): actions += ['skill2','skill3','skill4','skill5']
            clips = {}
            sheet_name = f'anim_stylea_{uid}_{view}'
            sheet = Image.new('RGBA',(SIZE*8,SIZE*len(actions)))
            for row,action in enumerate(actions):
                previous = old.get(action)
                if previous:
                    frames = previous['frames']
                else:
                    seconds = .12 if action not in ('idle','defeated') else .20
                    frames = [{'seconds':seconds} for _ in range(4)]
                    if action == 'attack': frames[1]['event']='strike'
                    if action.startswith('skill'): frames[2]['event']='cast'
                    if action == 'jump': frames[3]['event']='land'
                split = 8//len(frames)
                newframes=[]
                total=sum(f['seconds'] for f in frames)
                event_time=0
                has_event=False
                for f in frames:
                    if f.get('event'):
                        has_event=True; break
                    event_time+=f['seconds']
                elapsed=0
                for i,frame in enumerate(frames):
                    for sub in range(split):
                        col=i*split+sub
                        phase=col/(8 if action in ('idle','walk','run') else 7)
                        if has_event and action not in ('jump',) and 0<event_time<total:
                            phase=(elapsed/event_time*.5 if elapsed<=event_time else .5+.5*(elapsed-event_time)/(total-event_time))
                        markers={}
                        picture=framed_pose(parts[view],view,action,phase,unit,calibration,markers)
                        box=picture.getbbox()
                        if box is None or min(box[0],box[1],SIZE-box[2],SIZE-box[3])<3:
                            raise ValueError(f'{uid}/{view}/{action}/{col}: unsafe alpha bounds {box}')
                        sheet.alpha_composite(picture,(col*SIZE,row*SIZE))
                        entry={'index':row*8+col,'pivot':[.5,212/256-.36/display_scale],'seconds':frame['seconds']/split}
                        if sub==0 and frame.get('event'): entry['event']=frame['event']
                        if frame.get('muzzle'):
                            # 身体枪口按新绑定标定；仅位置变化，事件时刻保持原样。
                            entry['muzzle']=markers.get('muzzle', {'front':[.73,.50],'side':[.81,.47],'back':[.67,.36]}[view])
                        newframes.append(entry)
                        elapsed+=frame['seconds']/split
                clips[action]={'sheet':sheet_name,'columns':8,'rows':len(actions),'cellSize':SIZE,
                               'displayScale':display_scale,'loop':action in ('idle','walk','run'),'frames':newframes}
            sheets[view]=clips
            if args.publish: save_png(sheet,ROOT/'assets/resources/art'/f'{sheet_name}.png',optimize=True)
            # 每单位一张三方向接触表：待机、步态、攻击峰值、倒地。
        contact=Image.new('RGBA',(SIZE*4,SIZE*3),'#354454')
        for vi,view in enumerate(VIEWS):
            for ai,(action,t) in enumerate([('idle',0),('walk',.25),('attack',.5),('defeated',1)]):
                contact.alpha_composite(framed_pose(parts[view],view,action,t,unit,calibration),(ai*SIZE,vi*SIZE))
        contact.save(out/f'{uid}-contact.png')
        roster.alpha_composite(framed_pose(parts['front'],'front','idle',0,unit,calibration),(n%6*256,n//6*256))
        if args.publish:
            # 既有静态/方向回退资源同名覆盖，防止刚生成或异步载入时闪回旧形象。
            for view in VIEWS:
                for moving in (False,True):
                    suffix=('' if view=='front' else '_'+view)+('_move' if moving else '')
                    target_path=ROOT/'assets/resources/art'/f"{base['key']}{suffix}.png"
                    if target_path.exists() or not suffix:
                        static=framed_pose(parts[view],view,'walk' if moving else 'idle',.5 if moving else 0,unit,calibration)
                        save_png(static.resize((512,512),Image.Resampling.LANCZOS),target_path)
        exported[base['key']]=sheets
        summaries.append({'id':uid,'key':base['key'],'rig':unit['rig'],'views':VIEWS,'actions':list(sheets['front']),
                          'calibration':calibration,'category':tier,'visibleExtent':target,'displayScale':display_scale,
                          'generated':True,'browserVerified':False})
        print(f'[敌人烘焙] {uid}',flush=True)
    if args.unit == 'all': roster.save(out/'roster.png')
    if args.publish:
        path=WORK/'animation-data.json'
        if path.exists() and args.unit != 'all':
            current=json.loads(path.read_text(encoding='utf8'));current.update(exported);exported=current
        path.write_text(json.dumps(exported,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        text='// 由 tools/bake_enemy_rigs.py 从分层部件与原有释放时间生成。\n'
        text+="import type { ActorAnimationSet } from './ActorAnimationDB';\n"
        text+='export const STYLE_A_ENEMY_ANIMATIONS: Record<string, ActorAnimationSet> = '+json.dumps(exported,separators=(',',':'))+';\n'
        (ROOT/'assets/scripts/data/EnemyRigAnimationDB.ts').write_text(text,encoding='utf8')
    coverage_path=WORK/'coverage.json'
    if args.unit != 'all' and coverage_path.exists():
        current={u['id']:u for u in json.loads(coverage_path.read_text(encoding='utf8'))}
        current.update({u['id']:u for u in summaries});summaries=list(current.values())
    coverage_path.write_text(json.dumps(summaries,ensure_ascii=False,indent=2)+'\n',encoding='utf8')


if __name__ == '__main__':
    main()
