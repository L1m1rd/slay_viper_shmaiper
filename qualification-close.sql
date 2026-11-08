-- Close qualification while keeping main voting locked.
begin;
alter table public.award_stage drop constraint if exists award_stage_phase_check;
alter table public.award_stage add constraint award_stage_phase_check check (phase in ('qualification','closed','main'));
update public.award_stage set phase='closed' where id and phase='qualification';
commit;
