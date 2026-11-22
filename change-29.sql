-- 22 Nov 2026: the VA can also book a meetup for Ethan himself (any date, e.g. at Annandale Central). Ethan's own row becomes bookable by the VA.
update partners set va_can_book = true where role = 'owner';
