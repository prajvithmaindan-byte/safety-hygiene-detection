"""
Reconstruct files by applying CODE_ACTION diffs sequentially to git HEAD versions.
This is the most reliable approach since diffs are smaller and less likely truncated.
"""
import json
import re
import os
import subprocess

brain_dir = r"C:\Users\Prajvith G\.gemini\antigravity-ide\brain"
project_dir = r"c:\Users\Prajvith G\OneDrive\Desktop\idt 2026\hygieneguard"

files_to_recover = {
    'app.py': 'backend/app.py',
    'database.py': 'backend/database.py', 
    'detector.py': 'backend/detector.py',
    'style.css': 'frontend/css/style.css',
    'dashboard.html': 'frontend/dashboard.html',
    'index.html': 'frontend/index.html',
    'dashboard.js': 'frontend/js/dashboard.js',
    'monitor.js': 'frontend/js/monitor.js',
}

# Conversations in chronological order (June 5-6 before 1:15 PM)
conv_order = [
    '248d2c5d-6bd7-4485-9ebe-5a4b55f2b1ed',  # June 5 3:09 PM
    '5a420c2d-c05c-4a9c-adfe-bb058e724f82',  # June 5 8:37 PM
    '61a1faf7-ed5e-4427-bc1d-5be584100b83',  # June 6 11:16 AM
    # DO NOT include 02c449b9 - that's the 1:15 PM one with post-1:15 PM changes
]

def parse_unified_diff(diff_text):
    """Parse a unified diff into hunks"""
    hunks = []
    current_hunk = None
    
    for line in diff_text.split('\n'):
        hunk_match = re.match(r'^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@', line)
        if hunk_match:
            if current_hunk:
                hunks.append(current_hunk)
            current_hunk = {
                'old_start': int(hunk_match.group(1)),
                'old_count': int(hunk_match.group(2)) if hunk_match.group(2) else 1,
                'new_start': int(hunk_match.group(3)),
                'new_count': int(hunk_match.group(4)) if hunk_match.group(4) else 1,
                'old_lines': [],
                'new_lines': [],
                'context_and_changes': []
            }
        elif current_hunk is not None:
            if line.startswith('-'):
                current_hunk['context_and_changes'].append(('remove', line[1:]))
            elif line.startswith('+'):
                current_hunk['context_and_changes'].append(('add', line[1:]))
            elif line.startswith(' '):
                current_hunk['context_and_changes'].append(('context', line[1:]))
            # else: skip
    
    if current_hunk:
        hunks.append(current_hunk)
    
    return hunks

def apply_diff(original_lines, diff_text):
    """Apply a unified diff to file lines. Returns new lines or None on failure."""
    hunks = parse_unified_diff(diff_text)
    if not hunks:
        return None
    
    result = list(original_lines)
    offset = 0
    
    for hunk in hunks:
        pos = hunk['old_start'] - 1 + offset
        
        # Verify context matches
        old_lines_to_remove = []
        new_lines_to_add = []
        
        for action, content in hunk['context_and_changes']:
            if action == 'context':
                old_lines_to_remove.append(content)
                new_lines_to_add.append(content)
            elif action == 'remove':
                old_lines_to_remove.append(content)
            elif action == 'add':
                new_lines_to_add.append(content)
        
        # Remove old lines and insert new
        # Find the position by matching context
        del result[pos:pos + len(old_lines_to_remove)]
        for i, line in enumerate(new_lines_to_add):
            result.insert(pos + i, line)
        
        offset += len(new_lines_to_add) - len(old_lines_to_remove)
    
    return result

# Collect all CODE_ACTION diffs per file, in chronological order
all_diffs = {fname: [] for fname in files_to_recover}

for conv_id in conv_order:
    log_path = os.path.join(brain_dir, conv_id, '.system_generated', 'logs', 'transcript.jsonl')
    if not os.path.exists(log_path):
        continue
    
    with open(log_path, 'r', encoding='utf-8') as f:
        for tl in f:
            step = json.loads(tl)
            if step.get('type') != 'CODE_ACTION':
                continue
            content = step.get('content', '')
            if '[diff_block_start]' not in content:
                continue
            
            for fname in files_to_recover:
                if fname in content:
                    diff_start = content.find('[diff_block_start]')
                    diff_end = content.find('[diff_block_end]')
                    if diff_start >= 0 and diff_end >= 0:
                        diff = content[diff_start + len('[diff_block_start]'):diff_end].strip()
                        is_truncated = '<truncated' in diff
                        all_diffs[fname].append({
                            'diff': diff,
                            'conv': conv_id[:8],
                            'step': step['step_index'],
                            'time': step.get('created_at', ''),
                            'truncated': is_truncated
                        })

# Report
print("=== CODE_ACTION DIFFS FOUND ===")
for fname, diffs in all_diffs.items():
    truncated = sum(1 for d in diffs if d['truncated'])
    print(f"  {fname}: {len(diffs)} diffs ({truncated} truncated)")

# Check which diffs are truncated  
print("\n=== TRUNCATION DETAILS ===")
for fname, diffs in all_diffs.items():
    for d in diffs:
        if d['truncated']:
            trunc_match = re.search(r'<truncated (\d+) bytes>', d['diff'])
            bytes_lost = trunc_match.group(1) if trunc_match else '?'
            print(f"  {fname} conv {d['conv']} step {d['step']}: {bytes_lost} bytes truncated")
