> **节选说明 / Excerpt note**：本文件为官方文档节选（CC-BY-4.0）：仅保留以下小节，未修改任何文字。原文：https://gitee.com/openharmony/docs/raw/b84779874332bd7c2afee0ca3875494fa4793f1f/zh-cn/application-dev/reference/apis-arkui/arkui-ts/ts-basic-components-navigation.md

## 子组件

可以包含子组件。

从API version 9开始，推荐与[NavRouter](ts-basic-components-navrouter.md)组件搭配使用。

从API version 10开始，推荐使用[NavPathStack](#navpathstack10)配合[navDestination](#navdestination10)属性进行页面路由。

## 接口

### Navigation

Navigation()

创建路由导航的根视图容器，适用于使用[NavRouter](ts-basic-components-navrouter.md)组件进行页面路由。

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

### Navigation<sup>10+</sup>

Navigation(pathInfos: NavPathStack)

绑定导航控制器到Navigation组件，适用于使用[NavPathStack](#navpathstack10)配合[navDestination](#navdestination10)属性进行页面路由。

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：**

| 参数名       | 类型                            | 必填   | 说明   |
| --------- | ------------------------------- | ---- | ------ |
| pathInfos | [NavPathStack](#navpathstack10) | 是    | 导航控制器对象。 |

### Navigation<sup>20+</sup>

Navigation(pathInfos: NavPathStack, homeDestination: HomePathInfo)

绑定路由栈到Navigation组件，并且指定一个NavDestination作为Navigation的导航页（主页），适用于使用[NavPathStack](#navpathstack10)配合[navDestination](#navdestination10)属性或者系统路由表进行页面路由。使用示例参考[示例16（Navigation使用NavDestination作为导航页）](#示例16navigation使用navdestination作为导航页)。

**原子化服务API：** 从API version 20开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：**

| 参数名       | 类型                            | 必填   | 说明   |
| --------- | ------------------------------- | ---- | ------ |
| pathInfos | [NavPathStack](#navpathstack10) | 是    | 路由栈信息。 |
| homeDestination | [HomePathInfo](#homepathinfo20) | 是    | 主页NavDestination信息。 |

> **说明：**
>
> 如果使用了主页NavDestination，则Navigation有如下变化：
>
> - 开发者写在Navigation组件内的内容不会被创建。
>
> - 对于Navigation的各种属性，如果主页NavDestination有对应功能的属性，则Navigation的属性不生效。

### title

title(value: ResourceStr | CustomBuilder | NavigationCommonTitle | NavigationCustomTitle, options?: NavigationTitleOptions)

设置页面标题。

>**说明：**
>
> 从API version 12开始，该接口支持在[attributeModifier](ts-universal-attributes-attribute-modifier.md#attributemodifier)中调用。

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名  | 类型                                                         | 必填 | 说明                                                         |
| ------- | ------------------------------------------------------------ | ---- | ------------------------------------------------------------ |
| value   | [ResourceStr](ts-types.md#resourcestr)<sup>10+</sup>&nbsp;\|&nbsp;[CustomBuilder](ts-types.md#custombuilder8)&nbsp;\|&nbsp;[NavigationCommonTitle](#navigationcommontitle9)<sup>9+</sup>&nbsp;\|&nbsp;[NavigationCustomTitle](#navigationcustomtitle9)<sup>9+</sup> | 是   | 页面标题，使用NavigationCustomTitle类型设置height高度时，[titleMode](#titlemode)属性不会生效。<br/>字符串超长时，如果不设置副标题，先缩小再换行（2行）最后截断。如果设置副标题，先缩小最后截断。 |
| options<sup>11+</sup> | [NavigationTitleOptions](#navigationtitleoptions11) | 否   | 标题栏选项。 包含标题栏背景颜色、标题栏背景模糊样式及模糊选项、标题栏背景属性、标题栏布局方式、标题栏起始端内间距、标题栏结束端内间距、主标题属性修改器、子标题属性修改器、是否响应悬停态。                                                 |

### menus

menus(value: Array&lt;NavigationMenuItem&gt; | CustomBuilder)

设置页面右上角菜单。不设置时不显示菜单项。使用Array<[NavigationMenuItem](#navigationmenuitem)&gt; 写法时，竖屏最多支持显示3个图标，横屏最多支持显示5个图标，多余的图标会被放入自动生成的更多图标。

> **说明：**
>
> 不支持通过SymbolGlyphModifier对象的fontSize属性修改图标大小、effectStrategy属性修改动效、symbolEffect属性修改动效类型。

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型                                                         | 必填 | 说明             |
| ------ | ------------------------------------------------------------ | ---- | ---------------- |
| value  | Array<[NavigationMenuItem](#navigationmenuitem)&gt;&nbsp;\|&nbsp;[CustomBuilder](ts-types.md#custombuilder8) | 是   | 页面右上角菜单。 |

### menus<sup>19+</sup>

menus(items: Array&lt;NavigationMenuItem&gt; | CustomBuilder, options?: NavigationMenuOptions)

设置页面右上角菜单。不设置时不显示菜单项。与[menus](#menus)相比，新增菜单选项。使用Array<[NavigationMenuItem](#navigationmenuitem)&gt; 写法时，竖屏最多支持显示3个图标，横屏最多支持显示5个图标，多余的图标会被放入自动生成的更多图标。

> **说明：**
>
> 该接口不支持在[attributeModifier](ts-universal-attributes-attribute-modifier.md#attributemodifier)中调用。
>
> 不支持通过SymbolGlyphModifier对象的fontSize属性修改图标大小、effectStrategy属性修改动效、symbolEffect属性修改动效类型。

**原子化服务API：** 从API version 19开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型                                                         | 必填 | 说明             |
| ------ | ------------------------------------------------------------ | ---- | ---------------- |
| items  | Array<[NavigationMenuItem](#navigationmenuitem)&gt;&nbsp;\|&nbsp;[CustomBuilder](ts-types.md#custombuilder8) | 是   | 页面右上角菜单。 |
| options | [NavigationMenuOptions](#navigationmenuoptions19) | 否   | 页面右上角菜单选项。 |

### titleMode

titleMode(value: NavigationTitleMode)

设置页面标题栏显示模式。

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型                                                | 必填 | 说明                                                      |
| ------ | --------------------------------------------------- | ---- | --------------------------------------------------------- |
| value  | [NavigationTitleMode](#navigationtitlemode枚举说明) | 是   | 页面标题栏显示模式。<br/>默认值：NavigationTitleMode.Free |

### toolbarConfiguration<sup>10+</sup>

toolbarConfiguration(value: Array&lt;ToolbarItem&gt; | CustomBuilder, options?: NavigationToolbarOptions)

设置工具栏内容。不设置时不显示工具栏。

>**说明：**
>
> 从API version 20开始，该接口支持在[attributeModifier](ts-universal-attributes-attribute-modifier.md#attributemodifier)中调用。
>
> 不支持通过SymbolGlyphModifier对象的fontSize属性修改图标大小、effectStrategy属性修改动效、symbolEffect属性修改动效类型。

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

<!--Table: 10%; 20%; 8%; 62%-->
| 参数名  | 类型                                                         | 必填 | 说明                                                         |
| ------- | ------------------------------------------------------------ | ---- | ------------------------------------------------------------ |
| value   | &nbsp;Array&lt;[ToolbarItem](#toolbaritem10)&gt; &nbsp;\|&nbsp;[CustomBuilder](ts-types.md#custombuilder8) | 是   | 工具栏内容，使用Array&lt;[ToolbarItem](#toolbaritem10)&gt;设置的工具栏有如下特性：<br/>工具栏所有选项均分底部工具栏，在每个均分内容区布局文本和图标。<br/>竖屏模式最多支持显示5个图标，多余的图标会被放入自动生成的更多图标。横屏模式时，如果为[Split](#navigationmode9枚举说明)模式，仍按照竖屏模式显示，如果为[Stack](#navigationmode9枚举说明)模式需配合menus属性的Array&lt;[NavigationMenuItem](#navigationmenuitem)&gt;使用，底部工具栏会自动隐藏，同时底部工具栏所有选项移动至页面右上角菜单。<br/>使用[CustomBuilder](ts-types.md#custombuilder8)写法为用户自定义工具栏选项，不具备以上功能。 |
| options<sup>11+</sup> | [NavigationToolbarOptions](#navigationtoolbaroptions11) | 否   | 工具栏选项。 包含工具栏背景颜色、工具栏背景模糊样式及模糊选项、工具栏背景属性、工具栏布局方式、是否隐藏工具栏的文本、工具栏更多图标的菜单选项。                                                |

### hideToolBar

hideToolBar(value: boolean)

设置是否隐藏工具栏。

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型    | 必填 | 说明                                                         |
| ------ | ------- | ---- | ------------------------------------------------------------ |
| value  | boolean | 是   | 是否隐藏工具栏。<br/>true：隐藏工具栏；false：显示工具栏。<br/>传入参数非法时，按false处理。 |

### hideToolBar<sup>13+</sup>

hideToolBar(hide: boolean, animated: boolean)

设置是否隐藏工具栏。与[hideToolBar](#hidetoolbar)相比，新增工具栏显隐时是否使用动画。

**原子化服务API：** 从API version 13开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型    | 必填 | 说明                                                         |
| ------ | ------- | ---- | ------------------------------------------------------------ |
| hide  | boolean | 是   | 是否隐藏工具栏。<br/>true：隐藏工具栏；false：显示工具栏。<br/>传入参数非法时，按false处理。 |
| animated  | boolean | 是   | 设置是否使用动画显隐工具栏。<br/>true：使用动画显示隐藏工具栏；false：不使用动画显示隐藏工具栏。<br/>传入参数非法时，按false处理。 |

### hideTitleBar

hideTitleBar(value: boolean)

设置是否隐藏标题栏。

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型    | 必填 | 说明                                                         |
| ------ | ------- | ---- | ------------------------------------------------------------ |
| value  | boolean | 是   | 是否隐藏标题栏。<br/>true：隐藏标题栏；false：显示标题栏。<br/>传入参数非法时，按false处理。 |

### hideTitleBar<sup>13+</sup>

hideTitleBar(hide: boolean, animated: boolean)

设置是否隐藏标题栏。与[hideTitleBar](#hidetitlebar)相比，新增标题栏显隐时是否使用动画。

**原子化服务API：** 从API version 13开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型    | 必填 | 说明                                                         |
| ------ | ------- | ---- | ------------------------------------------------------------ |
| hide  | boolean | 是   | 是否隐藏标题栏。<br/>true：隐藏标题栏；false：显示标题栏。<br/>传入参数非法时，按false处理。 |
| animated  | boolean | 是   | 设置是否使用动画显隐标题栏。<br/>true：使用动画显示隐藏标题栏；false：不使用动画显示隐藏标题栏。<br/>传入参数非法时，按false处理。 |

### hideBackButton

hideBackButton(value: boolean)

设置是否隐藏标题栏中的返回键。返回键仅在[titleMode](#titlemode)设置为NavigationTitleMode.Mini时才生效。

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型    | 必填 | 说明                                                         |
| ------ | ------- | ---- | ------------------------------------------------------------ |
| value  | boolean | 是   | 是否隐藏标题栏中的返回键。<br/>true：隐藏返回键。<br/>false：显示返回键。<br/>传入参数非法时，按false处理。 |

### navBarWidth<sup>9+</sup>

navBarWidth(value: Length)

设置导航页宽度。仅在[mode](#mode9)设置为NavigationMode.Auto或NavigationMode.Split时生效。

从API version 18开始，该参数支持[!!](../../../ui/state-management/arkts-new-binding.md)双向绑定变量。

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型                         | 必填 | 说明                                      |
| ------ | ---------------------------- | ---- | ----------------------------------------- |
| value  | [Length](ts-types.md#length) | 是   | 导航页宽度。<br/>默认值：240<br/>单位：vp<br/>undefined：行为不做处理，导航页宽度与默认值保持一致。 |

### navBarPosition<sup>9+</sup>

navBarPosition(value: NavBarPosition)

设置导航页位置。仅在[mode](#mode9)设置为NavigationMode.Auto或NavigationMode.Split时生效。

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型                                       | 必填 | 说明                                          |
| ------ | ------------------------------------------ | ---- | --------------------------------------------- |
| value  | [NavBarPosition](#navbarposition9枚举说明) | 是   | 导航页位置。<br/>默认值：NavBarPosition.Start |

### mode<sup>9+</sup>

mode(value: NavigationMode)

设置导航页的显示模式，支持单栏（Stack）、分栏（Split）和自适应（Auto）。

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型                                       | 必填 | 说明                                                         |
| ------ | ------------------------------------------ | ---- | ------------------------------------------------------------ |
| value  | [NavigationMode](#navigationmode9枚举说明) | 是   | 导航页的显示模式。<br/>默认值：NavigationMode.Auto<br/>自适应：基于组件宽度自适应单栏和双栏。 |

### backButtonIcon<sup>9+</sup>

backButtonIcon(value: string | PixelMap | Resource | SymbolGlyphModifier)

设置标题栏中返回键图标。

> **说明：**
>
> 不支持通过SymbolGlyphModifier对象的fontSize属性修改图标大小、effectStrategy属性修改动效、symbolEffect属性修改动效类型。

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型                                                         | 必填 | 说明                 |
| ------ | ------------------------------------------------------------ | ---- | -------------------- |
| value  | string&nbsp;\|&nbsp;[PixelMap](../../apis-image-kit/arkts-apis-image-PixelMap.md)&nbsp;\|&nbsp;[Resource](ts-types.md#resource)&nbsp;\|&nbsp;[SymbolGlyphModifier<sup>12+</sup>](ts-universal-attributes-attribute-symbolglyphmodifier.md#symbolglyphmodifier)    | 是   | 标题栏中返回键图标。 |

### backButtonIcon<sup>19+</sup>

backButtonIcon(icon: string | PixelMap | Resource | SymbolGlyphModifier, accessibilityText?: ResourceStr)

设置标题栏中返回键图标和无障碍播报内容。

> **说明：**
>
> 该接口不支持在[attributeModifier](ts-universal-attributes-attribute-modifier.md#attributemodifier)中调用。
>
> 不支持通过SymbolGlyphModifier对象的fontSize属性修改图标大小、effectStrategy属性修改动效、symbolEffect属性修改动效类型。

**原子化服务API：** 从API version 19开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型                                                         | 必填 | 说明               |
| ------ | ------------------------------------------------------------ | ---- | ------------------ |
| icon  | string&nbsp;\|&nbsp;[PixelMap](../../apis-image-kit/arkts-apis-image-PixelMap.md)&nbsp;\|&nbsp;[Resource](ts-types.md#resource)&nbsp;\|&nbsp;[SymbolGlyphModifier](ts-universal-attributes-attribute-symbolglyphmodifier.md#symbolglyphmodifier)  | 是   | 标题栏中返回键图标。 |
| accessibilityText | [ResourceStr](ts-types.md#resourcestr) | 否 | 返回键无障碍播报内容。</br>默认值：系统语言是中文时为“返回”，系统语言是英文时为“back”。 |

### hideNavBar<sup>9+</sup>

hideNavBar(value: boolean)

设置是否隐藏导航页。设置为true时，隐藏Navigation的导航页，包括标题栏、内容区和工具栏。如果此时路由栈中存在NavDestination页面，则直接显示栈顶NavDestination页面，反之显示空白。

从API version 9开始到API version 10仅在双栏模式下生效。从API version 11开始在单栏、双栏与自适应模式均生效。

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型    | 必填 | 说明                               |
| ------ | ------- | ---- | ---------------------------------- |
| value  | boolean | 是   | 是否隐藏导航页。<br/>true：隐藏导航页；false：显示导航页。<br/>传入参数非法时，按false处理。|

### navDestination<sup>10+</sup>

navDestination(builder: (name: string, param: unknown) => void)

创建NavDestination组件。使用builder函数，基于name和param构造NavDestination组件。builder下只能有一个根节点。builder中允许在NavDestination组件外包含一层自定义组件， 但自定义组件不允许设置属性和事件，否则仅显示空白。

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名  | 类型                                   | 必填 | 说明                     |
| ------- | -------------------------------------- | ---- | ------------------------ |
| builder | (name: string, param: unknown) => void | 是   | 创建NavDestination组件。name：NavDestination页面名称。param：开发者设置的NavDestination页面详细参数，unknown可以是用户自定义的类型。 |

### navBarWidthRange<sup>10+</sup>

navBarWidthRange(value: [Dimension, Dimension])

设置导航页最小和最大宽度（双栏模式下生效）。未设置该接口时，最小宽度默认为240vp，最大宽度默认为组件宽度的40%，且不大于432vp，即导航页和内容区之间的分割线可以在此范围内进行拖拽。拖拽分割线使导航页宽度变化时，内容区的内容会被压缩。

分割线的拖拽范围：

| 条件| 拖拽范围  |
| ----| ----------- |
|navBarWidthRange和minContentWidth同时设置 | 满足minContentWidth所设置的值后，在navBarWidthRange所设置的范围内进行拖拽 |
|navBarWidthRange和minContentWidth均不设置 | 在navBarWidthRange默认的最小和最大范围内进行拖拽 |
|仅设置navBarWidthRange属性 | 在navBarWidthRange所设置的范围内进行拖拽，最大拖拽范围不能超过minContentWidth的默认值 |
|仅设置minContentWidth属性 | 在navBarWidthRange默认的最小和最大范围内进行拖拽 |
|仅设置navBarWidth属性 | 不支持拖拽 |

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名  | 类型                                                         | 必填 | 说明                                                         |
| ------- | ------------------------------------------------------------ | ---- | ------------------------------------------------------------ |
| value | [[Dimension](ts-types.md#dimension10), [Dimension](ts-types.md#dimension10)] | 是   | 导航页最小和最大宽度。设置异常值时按默认值处理。 |

### minContentWidth<sup>10+</sup>

minContentWidth(value: Dimension)

设置导航页内容区最小宽度（双栏模式下生效）。

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名  | 类型                                 | 必填 | 说明                                                         |
| ------- | ------------------------------------ | ---- | ------------------------------------------------------------ |
| value | [Dimension](ts-types.md#dimension10) | 是   | 导航页内容区最小宽度。<br/>默认值：360<br/>单位：vp<br/>undefined：行为不做处理，导航页内容区最小宽度与默认值保持一致。<br/>Auto模式断点计算：默认600vp，minNavBarWidth(240vp) + minContentWidth (360vp) |

### ignoreLayoutSafeArea<sup>12+</sup>

ignoreLayoutSafeArea(types?: Array&lt;LayoutSafeAreaType&gt;, edges?: Array&lt;LayoutSafeAreaEdge&gt;)

控制组件的布局，使其扩展到非安全区域。

> **说明：**
>   
> - 组件设置ignoreLayoutSafeArea之后生效的条件为：   
> 设置LayoutSafeAreaType.SYSTEM时，组件的边界与非安全区域重合时组件能够延伸到非安全区域下。
>   
> - 若组件扩展到非安全区域内，此时在非安全区域里触发的事件（例如：点击事件）等可能会被系统拦截，优先响应状态栏等系统组件。
>
> - 组件想要扩展到非安全区域内，需隐藏或者设置标题栏和工具栏为[STACK](ts-basic-components-navigation.md#barstyle12枚举说明)模式。

**原子化服务API：** 从API version 12开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型                                               | 必填 | 说明                                                         |
| ------ | -------------------------------------------------- | ---- | ------------------------------------------------------------ |
| types  | Array <[LayoutSafeAreaType](ts-universal-attributes-expand-safe-area.md#layoutsafeareatype12)> | 否   | 配置扩展安全区域的类型。<br />默认值：<br />[LayoutSafeAreaType.SYSTEM] |
| edges  | Array <[LayoutSafeAreaEdge](ts-universal-attributes-expand-safe-area.md#layoutsafeareaedge12)> | 否   | 配置扩展安全区域的方向。<br /> 默认值：<br />[LayoutSafeAreaEdge.TOP, LayoutSafeAreaEdge.BOTTOM]。|

### systemBarStyle<sup>12+</sup>

systemBarStyle(style: Optional&lt;SystemBarStyle&gt;)

当Navigation中显示Navigation首页时，设置对应系统状态栏的样式。

>**说明：**
>
> 1. 不建议混合使用systemBarStyle属性和window设置状态栏样式的相关接口，例如：[setWindowSystemBarProperties](../arkts-apis-window-Window.md#setwindowsystembarproperties9)。
> 2. 初次设置Navigation/NavDestination的systemBarStyle属性时，会备份当前状态栏样式用于后续的恢复场景。
> 3. Navigation总是以首页（路由栈内没有NavDestination时）或者栈顶NavDestination设置的状态栏样式为准。
> 4. Navigation首页或者任何栈顶NavDestination页面，如果设置了有效的systemBarStyle，则会使用设置的样式，反之如果之前已经备份了样式，则使用备份的样式，否则不做任何处理。
> 5. [Split](#navigationmode9枚举说明)模式下的Navigation，如果内容区没有NavDestination，则遵从Navigation首页的设置，反之则遵从栈顶NavDestination的设置。
> 6. 仅支持在主窗口的主页面中使用systemBarStyle设置状态栏样式。
> 7. 仅当Navigation占满整个页面时，设置的样式才会生效，当Navigation没有占满整个页面时，如果有备份的样式，则恢复备份的样式。
> 8. 当页面设置不同样式时，在页面转场开始时生效。
> 9. 非全屏窗口下，Navigation/NavDestination设置的状态栏不生效。
>
> 从API version 20开始，该接口支持在[attributeModifier](ts-universal-attributes-attribute-modifier.md#attributemodifier)中调用。

**原子化服务API：** 从API version 12开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型         | 必填 | 说明               |
| ------ | -------------- | ---- | ------------------ |
| style  | [Optional](ts-universal-attributes-custom-property.md#optionalt)&lt;[SystemBarStyle](../arkts-apis-window-i.md#systembarstyle12)&gt; | 是   | 系统状态栏样式。 |

### recoverable<sup>14+</sup>

recoverable(recoverable: Optional&lt;boolean&gt;)

配置Navigation是否可恢复。如配置为可恢复，当应用进程异常退出并重新冷启动时，可自动创建该Navigation，并恢复至异常退出时的路由栈。

>  **说明：**
>
> 1. 使用该接口需要先设置Navigation的通用属性[id](ts-universal-attributes-component-id.md#id)，否则该接口无效。
> 2. 该接口需要配合NavDestination的[recoverable](./ts-basic-components-navdestination.md#recoverable14)接口使用。
> 3. 恢复的过程中不可序列化的信息，例如不可序列化的参数与用户设置的onPop等，会被丢弃，无法恢复。
> 4. 当应用退到后台，因系统资源不足等原因被系统终止后，如果某页面已配置为可恢复，当应用再次被唤醒至前台时，系统将自动恢复该页面。详细说明请参考[UIAbility备份恢复](../../../application-models/ability-recover-guideline.md)，详细使用请参考[示例18](#示例18设置navigation可恢复)。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型         | 必填 | 说明               |
| ------ | -------------- | ---- | ------------------ |
| recoverable  | [Optional](ts-universal-attributes-custom-property.md#optionalt)&lt;boolean&gt; | 是   | Navigation是否可恢复，默认为不可恢复。<br/>true：路由栈可恢复；false：路由栈不可恢复。<br/>传入参数非法时，按false处理。|

### enableDragBar<sup>14+</sup>

enableDragBar(isEnabled: Optional&lt;boolean&gt;)

控制分栏场景下是否显示拖拽条。该属性在PC/2in1设备上不生效。

**原子化服务API：** 从API version 14开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型         | 必填 | 说明               |
| ------ | -------------- | ---- | ------------------ |
| isEnabled  | [Optional](ts-universal-attributes-custom-property.md#optionalt)&lt;boolean&gt; | 是   | 是否开启拖拽条，默认为无拖拽条样式。<br/>true：有拖拽条样式；false：无拖拽条样式。<br/>传入参数非法时，按false处理。|

### subTitle<sup>(deprecated)</sup>

subTitle(value: string)

设置页面副标题。

> **说明：**
>
> 从API version 8开始支持，从API version 9开始废弃，建议使用[title](#title)替代。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型   | 必填 | 说明         |
| ------ | ------ | ---- | ------------ |
| value  | string | 是   | 页面副标题。 |

### toolBar<sup>(deprecated)</sup>

toolBar(value: object | CustomBuilder)

设置工具栏内容。不设置时不显示工具栏。items均分底部工具栏，在每个均分内容区布局文本和图标，文本超长时，逐级缩小，缩小之后换行，最后截断。

> **说明：**
>
> 从API version 8开始支持，从API version 10开始废弃，建议使用[toolbarConfiguration](#toolbarconfiguration10)替代。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名 | 类型                                                         | 必填 | 说明         |
| ------ | ------------------------------------------------------------ | ---- | ------------ |
| value  | object&nbsp;\|&nbsp;[CustomBuilder](ts-types.md#custombuilder8) | 是   | 工具栏内容。 |

**object类型说明：** 

| 名称     | 类型            | 必填   | 说明              |
| ------ | ------------- | ---- | --------------- |
| value  | string        | 是    | 工具栏单个选项的显示文本。   |
| icon   | string        | 否    | 工具栏单个选项的图标资源路径。 |
| action | () =&gt; void | 否    | 当前选项被选中的事件回调。   |

### onTitleModeChange

onTitleModeChange(callback: (titleMode: NavigationTitleMode) =&gt; void)

当[titleMode](#titlemode)为NavigationTitleMode.Free时，随着可滚动组件的滑动标题栏模式发生变化时触发此回调。

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名    | 类型                                                | 必填 | 说明       |
| --------- | --------------------------------------------------- | ---- | ---------- |
| titleMode | [NavigationTitleMode](#navigationtitlemode枚举说明) | 是   | 标题模式。 |

### onNavBarStateChange<sup>9+</sup>

onNavBarStateChange(callback: (isVisible: boolean) =&gt; void) 

导航页显示状态切换时触发该回调。

**原子化服务API：** 从API version 11开始，该接口支持在原子化服务中使用。

**系统能力：** SystemCapability.ArkUI.ArkUI.Full

**参数：** 

| 参数名    | 类型    | 必填 | 说明                                           |
| --------- | ------- | ---- | ---------------------------------------------- |
| isVisible | boolean | 是   | isVisible为true时表示显示，为false时表示隐藏。 |
