// Types used across the project

type Page = {
  url: string;
  title: string;
  domain: string;
};

type PageElement = {
  tag: string;              // input, textarea, button
  type?: string;            // text, submit, checkbox
  label?: string;           // associated label text
  placeholder?: string;
  nameAttr?: string;
  ariaLabel?: string;
};

type PageContext = {
  timestamp: number;
  tabId: number;

  page: Page;
  element: PageElement;
  latestDomActions: DOMAction[];

  generatedDescription: string;


};

type DOMAction = {
  id: string;
  timestamp: number;
  tabId: number;

  page: Page;

  element: Element;

  action: {
    type:
      | "input"
      | "submit"
      | "click"
      | "navigation"
      | "other";

    value?: string;           // current input value (for input events)
  };
};
