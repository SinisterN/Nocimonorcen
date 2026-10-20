# Cuts the era 1 zombie (keepers original) into rig parts with pivots for the cut-out animation test.
# Output: <part>.png + rig.json in the working directory. Demo page: tools/rig/rig_lab_template.html (__PARTS__ = embedded parts).
import json, numpy as np
from PIL import Image, ImageDraw, ImageFilter
import cv2
src=Image.open('/mnt/user-data/outputs/keepers/era1/enemies/enemy_grunt_walk0.png').convert('RGBA')
A=np.array(src)
H,W=A.shape[:2]
P={
 'head':[(425,150),(470,75),(600,58),(745,75),(805,165),(800,290),(770,340),(700,370),(680,410),(660,455),(600,470),(545,462),(515,420),(495,340),(445,290),(425,240)],
 'armL':[(95,440),(150,375),(220,340),(290,340),(330,380),(380,362),(412,368),(418,412),(380,422),(340,410),(330,450),(370,520),(345,585),(300,592),(250,520),(232,560),(222,615),(150,622),(108,580),(92,520)],
 'armR':[(700,478),(742,468),(792,498),(862,498),(912,558),(938,620),(922,702),(882,756),(800,764),(758,722),(720,702),(688,692),(688,610),(728,578),(708,520)],
 'legL':[(398,640),(472,640),(500,700),(472,760),(474,828),(492,840),(492,902),(472,932),(400,948),(298,948),(272,905),(298,858),(380,828),(384,760),(398,700)],
 'legR':[(530,640),(622,630),(632,700),(662,760),(662,828),(702,848),(762,868),(778,922),(742,952),(600,952),(558,922),(568,842),(590,820),(570,760),(530,700)],
}
PIV={'head':(592,450),'armL':(410,390),'armR':(712,470),'legL':(445,655),'legR':(585,655),'torso':(515,560)}
def mask(poly,grow=0):
    m=Image.new('L',(W,H),0); ImageDraw.Draw(m).polygon(poly,fill=255)
    if grow: m=m.filter(ImageFilter.MaxFilter(grow*2+1))
    return np.array(m)>0
alpha=A[...,3]>0
used=np.zeros((H,W),bool)
parts={}
for k,poly in P.items():
    m=mask(poly,6)&alpha
    used|=mask(poly)&alpha
    parts[k]=m
torso=alpha&~used
n,lab,stats,_=cv2.connectedComponentsWithStats(torso.astype(np.uint8),8)
big=1+np.argmax(stats[1:,cv2.CC_STAT_AREA]); torso=lab==big
# torso: fill the area hidden under the head's chin/neck so turning the head never shows a hole
rgb=A[...,:3].copy()
hole=mask(P['head'])&(np.indices((H,W))[0]>380)
inp=cv2.inpaint(cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR),(hole*255).astype(np.uint8),9,cv2.INPAINT_TELEA)
inp=cv2.cvtColor(inp,cv2.COLOR_BGR2RGB)
T=A.copy()
# neck under the chin: a dark collar shadow, so a turning head shows shadow instead of a hole
T[hole,:3]=(58,44,52); T[hole,3]=255
torso_m=torso|hole
out={}
def save(name,img,m):
    a=img.copy(); a[~m,3]=0
    ys,xs=np.nonzero(m); x0,y0,x1,y1=xs.min(),ys.min(),xs.max()+1,ys.max()+1
    Image.fromarray(a[y0:y1,x0:x1]).save(f'{name}.png')
    px,py=PIV[name]
    out[name]={'x':int(x0),'y':int(y0),'w':int(x1-x0),'h':int(y1-y0),'px':px,'py':py}
save('torso',T,torso_m)
for k,m in parts.items(): save(k,A,m)
json.dump(out,open('rig.json','w'),indent=1)
# preview: exploded
prev=Image.new('RGBA',(1400,1250),(255,255,255,255))
off={'head':(0,-120),'armL':(-120,0),'armR':(140,0),'legL':(-60,120),'legR':(60,120),'torso':(0,0)}
for k in ['legL','legR','armL','armR','torso','head']:
    r=out[k]; im=Image.open(f'{k}.png'); ox,oy=off[k]; prev.alpha_composite(im,(r['x']+ox+180,r['y']+oy+120))
prev.convert('RGB').resize((700,625)).save('exploded.png')
print(out)
