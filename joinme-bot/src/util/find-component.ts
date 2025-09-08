import { APIBaseComponent, Component, ComponentType, TopLevelComponent } from "discord.js";

export type FindComponentsParams<C extends Component> = {
  type: C["type"];
  filter: (component: C) => boolean;
};

export const findComponents = <C extends Component>(
  topLevelComponents: TopLevelComponent[],
  { type, filter }: FindComponentsParams<C>,
): C[] =>
  topLevelComponents.flatMap((component) => {
    const matchingComponents: C[] = [];

    if (component.type === type && filter(component as unknown as C)) {
      matchingComponents.push(component as unknown as C);
    }

    if ("components" in component) {
      matchingComponents.push(
        ...component.components.flatMap((component) =>
          component.type === type && filter(component as unknown as C) ? [component as unknown as C] : [],
        ),
      );
    }

    return matchingComponents;
  });
