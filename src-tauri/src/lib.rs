mod commands;
mod database;
mod state;

use commands::{
    connection::{connect_postgres, connection_info, disconnect_postgres},
    query::{cancel_query, run_query},
    schema::{inspect_relation, list_columns, list_database_objects},
    table::{
        delete_table_row, delete_table_rows, export_table_data, insert_table_row, load_table_page,
        update_table_row, update_table_rows,
    },
};
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            connect_postgres,
            disconnect_postgres,
            connection_info,
            list_database_objects,
            list_columns,
            inspect_relation,
            load_table_page,
            insert_table_row,
            update_table_row,
            delete_table_row,
            update_table_rows,
            delete_table_rows,
            export_table_data,
            run_query,
            cancel_query
        ])
        .run(tauri::generate_context!())
        .expect("error while running Opaline");
}
