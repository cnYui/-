#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Split Posts #9, #10, #11 by locations
"""

import re

# Read the file
with open('backend/output/xhs-posts-review-2026-03-20T07-51-08.md', 'r', encoding='utf-8') as f:
    content = f.read()

# Define the splits
splits = {
    '1147': {  # Post #9
        'original_location': '无锡 - 鼋头渚',
        'locations': ['无锡 - 惠山古镇', '无锡 - 锡惠公园', '无锡 - 鼋头渚', '无锡 - 南长街']
    },
    '1146': {  # Post #10
        'original_location': '无锡 - 南长街',
        'locations': ['无锡 - 南禅寺码头', '无锡 - 南长街', '无锡 - 惠山古镇']
    },
    '1145': {  # Post #11
        'original_location': '无锡 - 东林书院',
        'locations': ['无锡 - 东林书院', '无锡 - 南禅寺', '无锡 - 蠡园']
    }
}

# Process each post
for post_id, split_info in splits.items():
    # Find the post
    pattern = rf'(## 贴文 #\d+ \(ID: {post_id}\).*?- \*\*位置\*\*: ){re.escape(split_info["original_location"])}(.*?)(---|\Z)'
    
    match = re.search(pattern, content, re.DOTALL)
    if match:
        prefix = match.group(1)
        post_body = match.group(2)
        separator = match.group(3)
        
        # Build the replacement with all locations
        replacement_parts = []
        for i, location in enumerate(split_info['locations']):
            if i == 0:
                # First one replaces the original
                replacement_parts.append(f"{prefix}{location}{post_body}")
            else:
                # Additional ones are inserted
                # Extract the full post header
                header_match = re.search(r'(## 贴文 #\d+ \(ID: ' + post_id + r'\).*?- \*\*用户\*\*:.*?- \*\*发布时间\*\*:.*?- \*\*位置\*\*: )', 
                                        prefix + split_info['original_location'] + post_body, re.DOTALL)
                if header_match:
                    full_prefix = header_match.group(1)
                    replacement_parts.append(f"\n\n{full_prefix}{location}{post_body}")
        
        replacement = ''.join(replacement_parts) + separator
        
        # Replace in content
        content = re.sub(pattern, replacement, content, count=1, flags=re.DOTALL)
        print(f"Split Post #{post_id} into {len(split_info['locations'])} locations")

# Write back
with open('backend/output/xhs-posts-review-2026-03-20T07-51-08.md', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done!")
