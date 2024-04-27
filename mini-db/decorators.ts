import "reflect-metadata";

// Persistence Decorator

// Usage example:
// @persistence({persist: false})
// propertyName: any;

export const persistence = (options: {
  persist: boolean;
}): PropertyDecorator => {
  return function (target: Object, propertyKey: string | symbol) {
    Reflect.defineMetadata(
      propertyKey,
      {
        ...Reflect.getMetadata(propertyKey, target),
        persist: options.persist,
      },
      target
    );
  };
};
