-- 20 Nov 2026: Declan (Townsville) covers the week Sat 21 - Sat 28 Nov instead of Quinn.
-- Aston books into whichever partners are marked va_can_book.
update partners set va_can_book = true, avail_prompts_from = '2026-11-21' where name = 'Declan';
update partners set va_can_book = false where name = 'Quinn';
