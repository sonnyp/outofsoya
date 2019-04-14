import { h } from "preact";
import { Router } from "preact-router";
import Header from "./header";
import Home from "../routes/home";

export default function App() {
  return (
    <div id="app">
      <Header />
      <Router>
        <Home path="/" />
      </Router>
    </div>
  );
}
