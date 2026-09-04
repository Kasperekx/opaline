mod commands;
mod database;
mod state;

use commands::{
    connection::{connect_postgres, connection_info, disconnect_postgres},
    query::{cancel_query, run_query},
    schema::{list_columns, list_database_objects},
    table::{delete_table_row, load_table_page, update_table_row},
};
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            connect_postgres,
            disconnect_postgres,
            connection_info,
            list_database_objects,
            list_columns,
            load_table_page,
            update_table_row,
            delete_table_row,
            run_query,
            cancel_query
        ])
        .run(tauri::generate_context!())
        .expect("error while running Opaline");
}
