-- 049 — "YDIV (Your day in Vrindavan)" -> "YDIV".
--
-- The long label from 040 does not fit a register column: on the printed
-- sheet and in tables it was cut to "YDIV (Your …", which says less than the
-- four letters alone. Everyone at the school knows what YDIV means.
--
-- Re-runnable.

update status_types
   set label = 'YDIV'
 where code = 'D'
   and label is distinct from 'YDIV';
