import { h } from "preact";
// import { Link } from "preact-router/match";
import style from "./style";
import { forget } from "../../utils";

const Header = () => (
  <header class={style.header}>
    <h1>Out of Soya</h1>
    <button onClick={forget}>Forget</button>
    {/* <nav>
      <Link activeClassName={style.active} href="/">
        Home
      </Link>
      <Link activeClassName={style.active} href="/profile">
        Me
      </Link>
      <Link activeClassName={style.active} href="/profile/john">
        John
      </Link>
    </nav> */}
  </header>
);

export default Header;
