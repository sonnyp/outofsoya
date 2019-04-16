import { h, Component } from "preact";
import style from "./style";
import classNames from "classnames";

import { main } from "../../glue";
import { feedback, Resource } from "../../utils";

const resource = "acct:outofsoya@foobar";
// const resource = "acct:outofsoya@5apps.com";

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

    this.resource
      .update(JSON.stringify(items), "application/json")
      .catch(console.error);
  }

  handleSubmit = async evt => {
    evt.preventDefault();

    const input = evt.target.elements.field;
    const { value } = input;
    if (!value) {
      input.focus();
      return;
    }

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

  async componentDidMount() {
    this.rs = await main(resource, "outofsoya:rw");

    if (!this.rs) return;

    const r = (this.resource = new Resource(this.rs, "/outofsoya/list.json"));

    // r.onConflict = async (localValue, localNode) => {
    //   const [remoteNode, res] = await r.get();
    //   const remoteValue = await res.json();

    //   console.log("conflict");
    //   console.log("local", localNode, localValue);
    //   console.log("remote", remoteNode, remoteValue);

    //   const resolved = [...localValue, ...remoteValue];
    //   console.log(resolved);

    //   return resolved;
    // };

    r.onConflict2 = async ([localNode, localFetch], [remoteNode, response]) => {
      console.log("oh wow conflict!!!");
      const localValue = JSON.parse(await localFetch());
      const remoteValue = await response.json();

      console.log("local", localNode, localValue);
      console.log("remote", remoteNode, remoteValue);

      const resolved = [...localValue, ...remoteValue];

      return JSON.stringify(resolved);
    };

    r.onChange = (value, node) => {
      this.setState({
        items: JSON.parse(value),
      });
    };

    r.subscribe();
  }

  componentWillUnmount() {
    this.resource.unsubscribe();
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
            name="field"
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
