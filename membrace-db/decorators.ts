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
      let clazz = target.constructor;
      Reflect.defineMetadata(
      propertyKey,
      {
        ...Reflect.getMetadata(propertyKey, clazz),
        persist: options.persist,
      },
      clazz
    );
  };
};
