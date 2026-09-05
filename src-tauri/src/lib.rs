mod app_exit;
mod backup;
mod commands;
mod database;
mod instance_lock;
mod profiles;
#[cfg(test)]
mod session_tests;
mod sql_files;
mod state;
#[cfg(test)]
mod tls_tests;

use commands::{
    connection::{
        active_connections, connect_profile, connection_catalog, connection_statuses,
        delete_profile, disconnect_postgres, save_profile, save_workspace, test_profile,
    },
    query::{cancel_query, run_query},
    schema::{inspect_relation, list_columns, list_database_objects, sql_completion_catalog},
    table::{
        apply_table_changes, delete_table_row, delete_table_rows, export_table_data,
        insert_table_row, load_table_page, load_table_row, save_text_export, update_table_row,
        update_table_rows,
    },
};
use state::AppState;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .manage(AppState::default())
        .manage(sql_files::SqlFiles::default())
        .manage(backup::BackupState::default())
        .manage(app_exit::ExitState::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if !window
                    .state::<app_exit::ExitState>()
                    .ready
                    .load(std::sync::atomic::Ordering::Acquire)
                {
                    return;
                }
                api.prevent_close();
                let _ = window.emit("request-app-exit", ());
            }
        })
        .setup(|app| {
            app.manage(instance_lock::InstanceLock::acquire(
                &app.path().app_config_dir()?,
            )?);
            app.manage(profiles::ProfileStore::new(
                app.path().app_config_dir()?.join("connections.json"),
            ));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            backup::backup_tools,
            backup::prepare_restore,
            backup::release_restore,
            backup::cancel_backup,
            backup::dump_database,
            backup::restore_database,
            commands::connection::move_profile,
            commands::connection::remove_workspace,
            commands::connection::preview_profile_import,
            commands::connection::import_profiles,
            commands::connection::export_profiles,
            sql_files::open_sql_file,
            sql_files::save_sql_file,
            sql_files::release_sql_file,
            sql_files::validate_sql_format,
            app_exit::exit_application,
            app_exit::enable_exit_guard,
            connection_catalog,
            save_workspace,
            test_profile,
            save_profile,
            delete_profile,
            connect_profile,
            active_connections,
            connection_statuses,
            disconnect_postgres,
            list_database_objects,
            sql_completion_catalog,
            list_columns,
            inspect_relation,
            load_table_page,
            load_table_row,
            apply_table_changes,
            insert_table_row,
            update_table_row,
            delete_table_row,
            update_table_rows,
            delete_table_rows,
            export_table_data,
            save_text_export,
            run_query,
            cancel_query
        ])
        .build(tauri::generate_context!())
        .expect("error while building Opaline")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                let state = app.state::<app_exit::ExitState>();
                if state.ready.load(std::sync::atomic::Ordering::Acquire)
                    && !state.allowed.load(std::sync::atomic::Ordering::Acquire)
                {
                    api.prevent_exit();
                    let _ = app.emit("request-app-exit", ());
                }
            }
        });
}
