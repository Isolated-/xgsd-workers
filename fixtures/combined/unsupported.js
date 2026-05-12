class MyInstance {
  constructor() {
    this.name = 'MyInstance'
    this.description = 'something about MyInstance'
  }
  someFunc() {}
}
export default function () {
  return new MyInstance()
}
