// Persistence Decorator

type PersistenceOptions = {
    /**
     * Whether this property should be persisted on disk or not (=transient)
     * Default: true
     */
    persist?: boolean;
};

//
/**
 * Usage example:
 * <pre><code>
 * @persistence({persist: false})
 * myProperty: any; *
 * </pre></code>
 * @param options
 */
export const persistence = (options: PersistenceOptions): PropertyDecorator => {
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
