INSERT INTO projects (id, name, api_key, allowed_origins, created_at) 
VALUES ('proj_test_123', 'Test App', 'live_key_xyz', '*', strftime('%s','now')); 

INSERT INTO tours (id, project_id, context_key, version_hash, steps_json, is_active, updated_at) 
VALUES ('tour_1', 'proj_test_123', '/home', 'dummy_hash_123', '[{"stepOrder":1,"title":"Welcome!","content":"This will disappear in 3 seconds.","targetSelector":"#test-header","autoAdvance":{"type":"time","delay":3000},"fingerprint":"{}"},{"stepOrder":2,"title":"Click Me","content":"Click this button to continue.","targetSelector":"#test-btn","autoAdvance":{"type":"interaction","event":"click"},"fingerprint":"{}"}]', 1, strftime('%s','now'));