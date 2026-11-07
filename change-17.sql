-- 7 Nov 2026: Ethan's new deduction guide prices. Every deduction is at least $50 (guide prices, judged by feel).
-- Screens at least $70 on iPhone 15 and above. Rear camera $100 on iPhone 15 and 16. Wi-Fi/Bluetooth ("Board Issue") is no longer used.
update partner_deductions set deduction_cents = greatest(deduction_cents, 5000) where fault <> 'Board Issue';
update partner_deductions set deduction_cents = greatest(deduction_cents, 7000) where fault = 'Broken Screen' and model ~ '^iPhone 1[5-9]';
update partner_deductions set deduction_cents = greatest(deduction_cents, 10000) where fault = 'Rear Camera Broken' and model ~ '^iPhone 1[56]';
