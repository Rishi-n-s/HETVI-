import os
import glob
import re

dir_path = r"c:\Users\AC\Desktop\the love"
files_to_check = glob.glob(os.path.join(dir_path, "**", "*.*"), recursive=True)
extensions = ['.html', '.css', '.js']

for file_path in files_to_check:
    if not any(file_path.endswith(ext) for ext in extensions):
        continue
        
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        new_content = re.sub(r'(?i)Eternal Scrapbook', 'BAKUDI NI STORY', content)
        
        if new_content != content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated: {file_path}")
    except Exception as e:
        print(f"Error on {file_path}: {e}")
