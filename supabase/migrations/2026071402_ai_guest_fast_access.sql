-- Align the runtime with the existing guest quota and public Fast UI.
update public.bohai_model_configs
   set min_tier = 'guest'
 where mode_id = 'fast';
