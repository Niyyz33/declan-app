-- Run this AFTER you've created the two logins in Authentication -> Users.
-- Replace the two emails with the ones you used.
insert into partners (id, name, role)
select id, 'Declan', 'partner' from auth.users where email = 'DECLANS-EMAIL-HERE';
insert into partners (id, name, role)
select id, 'Ethan', 'owner' from auth.users where email = 'YOUR-EMAIL-HERE';
