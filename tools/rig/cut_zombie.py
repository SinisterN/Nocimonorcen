# Cuts the era 1 zombie into rig parts: legs, torso, head, and each arm as forearm + hand + separate claw tips.
# Writes parts_data2.json (embedded parts) for tools/rig/rig_lab_template.html (__PARTS__).
import json, numpy as np, base64, io
from PIL import Image, ImageDraw, ImageFilter
import cv2
SRC='/mnt/user-data/outputs/keepers/era1/enemies/enemy_grunt_walk0.png'
A=np.array(Image.open(SRC).convert('RGBA')); H,W=A.shape[:2]
alpha=A[...,3]>0
def poly(p,grow=0):
    m=Image.new('L',(W,H),0); ImageDraw.Draw(m).polygon(p,fill=255)
    if grow: m=m.filter(ImageFilter.MaxFilter(grow*2+1))
    return np.array(m)>0
ARM_L=[(95,440),(150,375),(220,340),(290,340),(330,380),(380,362),(412,368),(418,412),(380,422),(340,410),(330,450),(370,520),(345,585),(300,592),(250,520),(232,560),(222,615),(150,622),(108,580),(92,520)]
ARM_R=[(700,478),(742,468),(792,498),(862,498),(912,558),(938,620),(922,702),(882,756),(800,764),(758,722),(720,702),(688,692),(688,610),(728,578),(708,520)]
FORE_L=[(300,372),(330,358),(372,350),(412,366),(418,412),(380,422),(360,421),(330,424),(300,418)]
FORE_R=[(700,478),(742,468),(785,490),(805,506),(792,538),(760,546),(722,522),(708,515)]
CLAWS={
 'clawL1':([(205,445),(222,442),(232,470),(231,500),(226,518),(214,500),(205,470)],(214,447),'handL'),
 'clawL2':([(126,567),(146,564),(160,584),(166,601),(150,597),(131,586)],(138,568),'handL'),
 'clawL3':([(159,551),(178,544),(195,564),(216,609),(198,604),(170,586),(159,570)],(168,549),'handL'),
 'clawL4':([(338,524),(353,529),(351,556),(336,576),(318,586),(320,570),(335,548)],(344,528),'handL'),
 'clawR1':([(691,631),(713,629),(715,656),(709,691),(698,671),(689,650)],(701,633),'handR'),
 'clawR2':([(804,704),(831,696),(852,704),(860,722),(831,731),(800,759),(791,750)],(818,702),'handR'),
 'clawR3':([(867,719),(895,714),(909,725),(886,746),(862,759),(859,745)],(882,718),'handR'),
}
HEAD=[(425,150),(470,75),(600,58),(745,75),(805,165),(800,290),(770,340),(700,370),(680,410),(660,455),(600,470),(545,462),(515,420),(495,340),(445,290),(425,240)]
LEG_L=[(398,640),(472,640),(500,700),(472,760),(474,828),(492,840),(492,902),(472,932),(400,948),(298,948),(272,905),(298,858),(380,828),(384,760),(398,700)]
LEG_R=[(530,640),(622,630),(632,700),(662,760),(662,828),(702,848),(762,868),(778,922),(742,952),(600,952),(558,922),(568,842),(590,820),(570,760),(530,700)]

masks={}; used=np.zeros((H,W),bool)
for k,p in [('head',HEAD),('legL',LEG_L),('legR',LEG_R),('armL',ARM_L),('armR',ARM_R)]:
    masks[k]=poly(p,6)&alpha; used|=poly(p)&alpha
torso=alpha&~used
n,lab,st,_=cv2.connectedComponentsWithStats(torso.astype(np.uint8),8); torso=lab==(1+np.argmax(st[1:,cv2.CC_STAT_AREA]))
hole=poly(HEAD)&(np.indices((H,W))[0]>380)
T=A.copy(); T[hole,:3]=(58,44,52); T[hole,3]=255
masks['torso']=torso|hole
# arms: forearm (grown a little so the wrist overlaps), hand = rest of the arm minus claws
claw_m={k:poly(p,2)&alpha for k,(p,_,_) in CLAWS.items()}
for side,F in (('L',FORE_L),('R',FORE_R)):
    arm=masks.pop('arm'+side)
    fore=arm&poly(F,5)
    hand=arm&~poly(F)
    for k,m in claw_m.items():
        if k.startswith('claw'+side): hand&=~m
    masks['fore'+side]=fore; masks['hand'+side]=hand
for k,m in claw_m.items(): masks[k]=m
PIV={'head':(592,450),'legL':(445,655),'legR':(585,655),'torso':(515,560),'foreL':(410,390),'foreR':(712,470),'handL':(306,395),'handR':(792,516)}
PARENT={'head':'body','torso':'body','foreL':'body','foreR':'body','handL':'foreL','handR':'foreR','legL':'root','legR':'root'}
for k,(p,b,par) in CLAWS.items(): PIV[k]=b; PARENT[k]=par
S=0.5; out={}
for k,m in masks.items():
    img=T if k=='torso' else A
    a=img.copy(); a[~m,3]=0
    ys,xs=np.nonzero(m); x0,y0,x1,y1=xs.min(),ys.min(),xs.max()+1,ys.max()+1
    im=Image.fromarray(a[y0:y1,x0:x1]).resize((max(1,round((x1-x0)*S)),max(1,round((y1-y0)*S))),Image.LANCZOS)
    b=io.BytesIO(); im.save(b,'PNG',optimize=True)
    e={'src':'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode(),'x':x0*S,'y':y0*S,'px':PIV[k][0]*S,'py':PIV[k][1]*S,'parent':PARENT[k]}
    if k.startswith('claw'):
        # curl direction: turn the tip towards the hand's middle
        hm=masks['hand'+k[4]]; hy,hx=np.nonzero(hm); cx,cy=hx.mean(),hy.mean()
        cy_,cx_=np.nonzero(m); tx,ty=cx_.mean(),cy_.mean(); bx,by=PIV[k]
        cross=(tx-bx)*(cy-by)-(ty-by)*(cx-bx); e['curl']=1 if cross>0 else -1
    out[k]=e
bb=Image.open(SRC).getbbox(); w=Image.open(SRC).crop(bb); w=w.resize((round(w.width*S),round(w.height*S)),Image.LANCZOS)
b=io.BytesIO(); w.save(b,'PNG',optimize=True); out['_whole']={'src':'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode(),'x':bb[0]*S,'y':bb[1]*S}
json.dump(out,open('parts_data2.json','w'))
# exploded preview
prev=Image.new('RGBA',(1500,1300),(255,255,255,255))
off={'head':(0,-110),'foreL':(-70,0),'handL':(-160,30),'foreR':(80,0),'handR':(170,40),'legL':(-50,120),'legR':(50,120),'torso':(0,0)}
for k in out:
    if k=='_whole': continue
    e=out[k]; im=Image.open(io.BytesIO(base64.b64decode(e['src'].split(',')[1])))
    ox,oy=off.get(k,off.get('hand'+k[4] if k.startswith('claw') else k,(0,0)))
    if k.startswith('claw'): ox,oy=ox*1.6,oy*1.6+30
    prev.alpha_composite(im.resize((im.width*2,im.height*2)),(int(e['x']*2+ox+230),int(e['y']*2+oy+130)))
prev.convert('RGB').resize((750,650)).save('exploded2.png')
print({k:(v.get('parent'),v.get('curl')) for k,v in out.items()})
