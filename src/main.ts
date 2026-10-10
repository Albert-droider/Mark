import "katex/dist/katex.min.css";
import "./styles/markdown.css";
import "./styles/app.css";
import "./styles/notes.css";
import { App } from "./app";

const root = document.getElementById("app");
if (root) {
  const app = new App();
  app.mount(root);
}
