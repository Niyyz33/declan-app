-- Change 11 (4 Nov 2026): tell Ethan when a partner finishes the whole "Start here" checklist.
alter table partners add column if not exists checklist_done_notified_at timestamptz;
