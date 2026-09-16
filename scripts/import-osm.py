"""Convert the public OSM XML extract to compact cockpit geometry.
Usage: python3 scripts/import-osm.py /path/to/los-angeles.osm
Source: https://api.openstreetmap.org/api/0.6/map?bbox=-118.260,34.040,-118.240,34.060
"""
from pathlib import Path
import xml.etree.ElementTree as ET
import sys, json, math, heapq, re
root=ET.parse(sys.argv[1]).getroot()
nodes={n.get('id'):[float(n.get('lon')),float(n.get('lat'))] for n in root.findall('node')}
roads=[]; buildings=[]; graph={}; named={}
valid={'residential','primary','secondary','tertiary','unclassified','trunk','motorway','primary_link','secondary_link','tertiary_link','trunk_link','motorway_link','living_street'}
def dist(a,b):return math.hypot((a[0]-b[0])*92000,(a[1]-b[1])*111000)
def add(a,b):graph.setdefault(a,[]).append((b,dist(nodes[a],nodes[b])))
def number(value,default):
 try:
  n=float(re.search(r'[0-9.]+',value)[0]);return n*.3048 if 'ft' in value or "'" in value else n
 except (TypeError,ValueError):return default
for w in root.findall('way'):
 tags={e.get('k'):e.get('v') for e in w.findall('tag')}
 ids=[e.get('ref') for e in w.findall('nd')]
 if not all(i in nodes for i in ids):continue
 pts=[nodes[i] for i in ids]
 if tags.get('highway') in valid:
  roads.append({'id':w.get('id'),'name':tags.get('name',''),'kind':tags['highway'],'points':pts})
  named.setdefault(tags.get('name',''),set()).update(ids)
  if tags.get('access')!='private' and tags.get('highway') not in {'motorway','trunk','motorway_link','trunk_link'}:
   for a,b in zip(ids,ids[1:]):
    if tags.get('oneway')!='-1':add(a,b)
    if tags.get('oneway') not in {'yes','1','true'}:add(b,a)
 if tags.get('building') and len(pts)>=4 and ids[0]==ids[-1]:
  h=number(tags.get('height'),number(tags.get('building:levels'),4)*3.3)
  buildings.append({'id':w.get('id'),'points':pts,'height':min(350,max(3,h)),'heightEstimated':'height' not in tags})
def intersection(a,b):
 options=named[a]&named[b]
 if not options:raise ValueError(f'No junction between {a} and {b}')
 return sorted(options)[0]
def path(a,b):
 queue=[(0,a)];best={a:0};prev={}
 while queue:
  cost,node=heapq.heappop(queue)
  if cost!=best[node]:continue
  if node==b:
   result=[b]
   while result[-1]!=a:result.append(prev[result[-1]])
   return result[::-1]
  for next_node,length in graph.get(node,[]):
   score=cost+length
   if score<best.get(next_node,float('inf')):best[next_node]=score;prev[next_node]=node;heapq.heappush(queue,(score,next_node))
 raise ValueError('No connected driving route')
corners=[intersection('South Broadway','West 5th Street'),intersection('South Broadway','West 3rd Street'),intersection('South Spring Street','West 3rd Street'),intersection('South Spring Street','West 5th Street')]
route=[]
for a,b in zip(corners,corners[1:]+corners[:1]):route.extend(path(a,b)[:-1])
route.append(corners[0])
data={'source':'© OpenStreetMap contributors, ODbL 1.0','downloaded':'2026-09-15','bounds':[-118.260,34.040,-118.240,34.060],'roads':roads,'buildings':buildings,'driveRoute':[nodes[i] for i in route],'routeNodeIds':route,'routeName':'Broadway / Spring loop','landmarks':[{'name':'Pershing Square','lon':-118.2531,'lat':34.0486},{'name':'Grand Central Market','lon':-118.2488,'lat':34.0507},{'name':'Bradbury Building','lon':-118.2478,'lat':34.0505},{'name':'Bunker Hill','lon':-118.2518,'lat':34.0546},{'name':'City Hall','lon':-118.2437,'lat':34.0537}]}
out=Path(__file__).resolve().parents[1]/'public/data/los-angeles.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(data,separators=(',',':'))+'\n')
print(f'{len(roads)} roads, {len(buildings)} buildings, {len(route)} connected route vertices → {out}')
