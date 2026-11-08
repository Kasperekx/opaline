// App-wide stylesheets in cascade order. Imported first by App and by the
// standalone UI fixtures in tests/, so every entry point shares one order.
// layers.css must stay first: it declares the cascade-layer order.
import "./layers.css";
import "../App.css";
import "./shell/explorer.css";
import "./shell/workbench.css";
import "../features/query/editor.css";
import "../features/query/drawers.css";
import "../features/table/table-base.css";
import "./shell/statusbar.css";
import "../features/connections/connections.css";
import "../features/connections/connection-home.css";
import "../shared/safety/safety.css";
import "./controls.css";
import "./feedback.css";
import "./studio.css";
import "../features/table/table-grid.css";
import "../features/connections/profile-editor.css";
import "./vendor-overrides.css";
