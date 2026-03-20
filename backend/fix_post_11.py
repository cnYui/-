#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fix Post #11 split
"""

import re

# Read the file
with open('backend/output/xhs-posts-review-2026-03-20T07-51-08.md', 'r', encoding='utf-8') as f:
    content = f.read()

# The full content for Post #11
full_content = """day2 一天的路线是东林书院---南禅寺---蠡园 依旧建议地铁出行，地铁口离景区都非常近，景区周边不好停车 东林书院：可去可不去 免费景点，里面不太大，很快不到一个小时就能全逛完，里面有个很小的小园林，适合爱好历史的同学参观 南禅寺：可以去 免费景点，寺庙不大，但是香火很旺，我没有烧香，在寺庙里吃了素面就走了。素面不如西园寺龙华寺的好吃，文创非常一般，超甜老式月饼，避雷。南禅寺门口有一条很长的小吃街，相当热闹，可以逛很久。 蠡园：建议春夏去 门票20，比较大的一个临湖园林，秋冬季节河面的荷叶都枯了，不过很多情侣在这儿拍婚纱照，除了出片外还可能和范蠡西施的典故相关。景区外面有个免费的大草地，很多人在上面露营，时间关系没有游览。 #上海交通大学[话题]# #佛系旅游篇[话题]# #说走就走[话题]# #换个地方过周末[话题]#"""

# Find and fix the corrupted Post #11 entries
# Pattern to find the broken entries
pattern = r'(## 贴文 #11 \(ID: 1145\).*?- \*\*位置\*\*: 无锡 - 东林书院.*?\*\*内容\*\*:\s*```\s*)day2 一天的路线是东林书院\s*(## 贴文 #11 \(ID: 1145\).*?- \*\*位置\*\*: 无锡 - 南禅寺.*?\*\*内容\*\*:\s*```\s*)day2 一天的路线是东林书院\s*(## 贴文 #11 \(ID: 1145\).*?- \*\*位置\*\*: 无锡 - 蠡园.*?\*\*内容\*\*:\s*```\s*)' + re.escape(full_content)

match = re.search(pattern, content, re.DOTALL)
if match:
    # Rebuild with correct content
    replacement = match.group(1) + full_content + '\n```\n\n' + match.group(2) + full_content + '\n```\n\n' + match.group(3) + full_content
    content = re.sub(pattern, replacement, content, flags=re.DOTALL)
    print("Fixed Post #11")
else:
    print("Pattern not found, trying alternative fix...")
    # Alternative: find each broken entry and fix individually
    # Fix first entry (东林书院)
    pattern1 = r'(## 贴文 #11 \(ID: 1145\).*?- \*\*位置\*\*: 无锡 - 东林书院.*?\*\*内容\*\*:\s*```\s*)day2 一天的路线是东林书院\s*\n\n(## 贴文 #11)'
    if re.search(pattern1, content, re.DOTALL):
        content = re.sub(pattern1, r'\1' + full_content + '\n```\n\n\\2', content, flags=re.DOTALL)
        print("Fixed Post #11 - 东林书院")
    
    # Fix second entry (南禅寺)
    pattern2 = r'(## 贴文 #11 \(ID: 1145\).*?- \*\*位置\*\*: 无锡 - 南禅寺.*?\*\*内容\*\*:\s*```\s*)day2 一天的路线是东林书院\s*\n\n(## 贴文 #11)'
    if re.search(pattern2, content, re.DOTALL):
        content = re.sub(pattern2, r'\1' + full_content + '\n```\n\n\\2', content, flags=re.DOTALL)
        print("Fixed Post #11 - 南禅寺")

# Write back
with open('backend/output/xhs-posts-review-2026-03-20T07-51-08.md', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done!")
