import { h, Component } from "preact";
import style from "./style";
import classNames from "classnames";

import { main } from "../../glue";
import { feedback, Resource } from "../../utils";

const Item = ({ item, onRemove, onChange, ...props }, state) => {
  const { value, done } = item;

  return (
    <li class={style.item} {...props}>
      <div onClick={() => onChange(!done)}>
        <span class={classNames({ strikethrough: done })}>{value}</span>
      </div>
      {done && (
        <button class={style.remove} onClick={onRemove}>
          🗑
        </button>
      )}
    </li>
  );
};

function sortByDate(a, b) {
  return new Date(b.created) - new Date(a.created);
}

async function resolveConflict([localNode, getLocal], [remoteNode, response]) {
  console.log("oh wow conflict!!!");
  const localValue = JSON.parse(await getLocal());
  const remoteValue = await response.json();

  console.log("local", localNode, localValue);
  console.log("remote", remoteNode, remoteValue);

  const resolved = [...localValue, ...remoteValue].reduce(
    (accumulator, item) => {
      if (!accumulator.find(_ => _.value === item.value)) {
        accumulator.unshift(item);
      }

      return accumulator;
    },
    [],
  );

  return JSON.stringify(resolved.sort(sortByDate));
}

async function resolveConflict2([localNode, localValue], fetch) {
  console.log("oh wow conflict2!!!");

  localValue = JSON.parse(localValue);

  const [remoteNode, res] = await fetch();

  const remoteValue = await res.json();

  console.log("local", localNode, localValue);
  console.log("remote", remoteNode, remoteValue);

  const resolved = [...localValue, ...remoteValue].reduce(
    (accumulator, item) => {
      if (!accumulator.find(_ => _.value === item.value)) {
        accumulator.unshift(item);
      }

      return accumulator;
    },
    [],
  );

  console.log(resolved);

  return JSON.stringify(resolved.sort(sortByDate));
}

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
      items: [{ value, done: false, created: new Date() }, ...this.state.items],
    });

    evt.target.reset();

    this.save();
  };

  handleItemPress(item) {
    feedback("/assets/pencil.wav");

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
    let resource;

    if (window.location.hostname === "outofsoya.netlify.com") {
      resource = "acct:outofsoya@5apps.com";
    } else {
      resource = "acct:outofsoya@foobar";
    }

    this.rs = await main(resource, "outofsoya:rw");

    if (!this.rs) return;

    const r = (this.resource = new Resource(this.rs, "/outofsoya/list.json"));

    r.onConflict = resolveConflict;

    r.onConflict2 = resolveConflict2;

    r.onChange = (value, node) => {
      this.setState({
        items: JSON.parse(value).sort(sortByDate),
      });
    };

    r.onRemoteChanges = ([remoteNode, res], localNode) => {
      console.log("remote changes");
      console.log("remote", remoteNode);
      console.log("local", localNode);
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
