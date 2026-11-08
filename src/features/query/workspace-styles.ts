/* Stylesheets of the lazily loaded workspace surfaces, imported eagerly and in
   their original order. Within a cascade layer, source order decides ties, so
   letting these load with their chunks would append them after the shell and
   feature sheets imported by App.tsx and change which rule wins. */
import "../structure/sql-highlight.css";
import "../explorer/namespace-dialog.css";
import "../structure/structure.css";
import "../table/inline-editing.css";
import "./query-library.css";
import "../backup/backup.css";
import "../structure/schema-editor.css";
