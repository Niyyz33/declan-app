-- Marks who is who. Run once after the two logins exist.
insert into partners (id, name, role)
select id, 'Declan', 'partner' from auth.users where email = 'harryjohnson11568@gmail.com';
insert into partners (id, name, role)
select id, 'Ethan', 'owner' from auth.users where email = 'ethan.lancuba@gmail.com';

-- Shows both rows so you can check it worked.
select name, role from partners order by role;
