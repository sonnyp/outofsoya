import { h, Component } from "preact";
import style from "./style";
import classNames from "classnames";

import { main } from "../../glue";
import { feedback, test } from "../../utils";

const resource = "acct:sonny@5apps.com";

const Item = ({ item, onRemove, onChange, ...props }, state) => {
  const { value, done } = item;

  return (
    <li class={style.item} {...props}>
      <div
        class={classNames({ [style.done]: done })}
        onClick={() => onChange(!done)}
      >
        {value}
      </div>
      {done && (
        <button class={style.remove} onClick={onRemove}>
          🗑
        </button>
      )}
    </li>
  );
};

class List extends Component {
  state = {
    items: [],
  };

  async save() {
    if (!this.rs) return;

    const { items } = this.state;

    const blob = new Blob([JSON.stringify(items, null, 2)], {
      type: "application/json",
    });

    const node = await this.rs.put("/outofsoya/list.json", blob, {
      // headers: {
      //   "If-Match": this.version,
      // },
    });
    this.version = node.version;
  }

  handleSubmit = evt => {
    evt.preventDefault();
    const value = evt.target.elements.new.value;
    if (!value) return;

    feedback();

    this.setState({
      items: [{ value, done: false }, ...this.state.items],
    });

    evt.target.reset();

    this.save();
  };

  handleItemPress(item) {
    feedback();

    item.done = !item.done;

    this.setState({
      items: this.state.items,
    });

    this.save();
  }

  handleItemRemove(item) {
    feedback();

    this.setState({ items: this.state.items.filter(i => i !== item) });

    this.save();
  }

  constructor(...params) {
    super(...params);
    this.version = null;
  }

  async componentDidMount() {
    this.rs = await main(resource, "outofsoya:rw");

    if (!this.rs) return;

    const updates = test(this.rs, "/outofsoya/list.json");

    this.subscription = updates.subscribe(([items, node]) => {
      this.version = node.version;
      this.setState({
        items,
      });
    });
  }

  componentWillUnmount() {
    this.subscription.unsubscribe();
  }

  render(props, state) {
    const { items } = state;

    return (
      <div class={style.root}>
        <form onSubmit={this.handleSubmit} class={style.form}>
          <input
            autofocus
            autocomplete="off"
            type="text"
            name="new"
            placeholder="soya"
          />
          <input type="submit" value="➕" class={style.addButton} />
        </form>

        <ul class={style.list}>
          {items.map((item, idx) => (
            <Item
              key={idx}
              item={item}
              onChange={() => {
                this.handleItemPress(item);
              }}
              onRemove={() => this.handleItemRemove(item)}
            />
          ))}
        </ul>
      </div>
    );
  }
}

export default List;
